/*******************************************************************************************************************
 * predefined map layers
 */

// Source for the coordinateLine features
var _sourceFeatures = new ol.source.Vector({
    features: []
});
// layer for the featuress
var _layerFeatures = new ol.layer.Vector({
    source: _sourceFeatures
});

// layer groups for the different map styles
var _layersOSM = new ol.layer.Group({
    layers: [
        new ol.layer.Tile({
            source: new ol.source.OSM()
        }),
        _layerFeatures
    ]
});


/*******************************************************************************************************************
 global variables
 */
var _map = new ol.Map({
    target: 'map',
    layers: _layersOSM,
    view: new ol.View({
        zoom: 1
    })
});

var _view = _map.getView();


/*******************************************************************************************************************
 * Connector object for the java application with the functions to be called.
 * @param javaConnector the javaConnector object
 */

function JSMapView(javaConnector) {
    this.coordinateLines = {};
    this.mapObjects = {};
    this.javaConnector = javaConnector;
    this.anchorsPatched = false;
    this.bingMapsApiKey = '';
}

JSMapView.prototype.toString = function () {
    return 'JSMapView with javaConnector ' + this.javaConnector;
};

/**
 * initializes the JSMapView and the map.
 */
JSMapView.prototype.init = function () {
    _map.on('singleclick', function (evt) {
        var coordinate = cToWGS84(evt.coordinate);
        // lat/lon reversion
        this.javaConnector.singleClickAt(coordinate[1], coordinate[0]);
    }, this);

    _map.on('postrender',
        function (evt) {
            if (!this.anchorsPatched) {
                var anchors = document.getElementById('map').getElementsByTagName('a');
                for (var i = 0; i < anchors.length; ++i) {
                    var anchor = anchors[i];
                    var href = anchor.href;
                    // only patch if not already a javascript link
                    if (href && href.lastIndexOf('javascript', 0) !== 0) {
                        this.javaConnector.debug('patching anchor for ' + href);
                        anchor.href = 'javascript:_javaConnector.showLink("' + href + '");';
                        this.anchorsPatched = true;
                    }
                }
            }
        }, this);

    _view.on('change:center', function (evt) {
        var center = cToWGS84(evt.target.get('center'));
        // lat/lon reversion
        this.javaConnector.centerMovedTo(center[1], center[0]);
    }, this);

    _view.on('change:resolution', function (evt) {
        this.javaConnector.zoomChanged(_view.getZoom());
    }, this);


};

/**
 * sets the center of the map
 *
 * @param {number} lat value in WGS84
 * @param {number} lon value in WGS84
 * @param {number} animationDuration duration in ms
 */
JSMapView.prototype.setCenter = function (lat, lon, animationDuration) {
    // transform uses x/y coordinates, thats lon/lat
    var newCenter = cFromWGS84([lon, lat]);
    var oldCenter = _view.getCenter();
    if (oldCenter && animationDuration > 1) {
        var anim = ol.animation.pan({
            duration: animationDuration,
            source: oldCenter
        });
        _map.beforeRender(anim);
    }
    _view.setCenter(newCenter);
};

/**
 * sets the zoom of the map
 *
 * @param {number} zoom level
 * @param {number} animationDuration duration in ms
 */
JSMapView.prototype.setZoom = function (zoom, animationDuration) {
    if (zoom != _view.getZoom()) {
        var res = _view.getResolution();
        if (res && animationDuration > 1) {
            var anim = ol.animation.zoom({
                resolution: res,
                duration: animationDuration
            });
            _map.beforeRender(anim);
        }
        _view.setZoom(zoom);
    }
};

/**
 * sets the extent of the map
 *
 * @param {number} minLat latitude value in WGS84
 * @param {number} minLon longitude value in WGS84
 * @param {number} maxLat latitude value in WGS84
 * @param {number} maxLon longitude value in WGS84
 * @param {number} animationDuration duration in ms
 */
JSMapView.prototype.setExtent = function (minLat, minLon, maxLat, maxLon, animationDuration) {
    // lat/lon reversion
    var extent = eFromWGS84([minLon, minLat, maxLon, maxLat]);
    if (animationDuration > 1) {
        var animPan = ol.animation.pan({
            duration: animationDuration,
            source: _view.getCenter()
        });
        var animZoom = ol.animation.zoom({
            resolution: _view.getResolution(),
            duration: animationDuration
        });
        _map.beforeRender(animPan, animZoom);
    }
    _view.fit(extent, _map.getSize());
};

/**
 * sets the map type
 *
 * @param {string} newType the new map type
 */
JSMapView.prototype.setMapType = function (newType) {
    // reset the patched flag; the new layer can have different attributions
    this.anchorsPatched = false;
    if (newType == 'OSM') {
        _map.setLayerGroup(_layersOSM);
    } else if (newType == 'BINGMAPS_ROAD') {
        _map.setLayerGroup(new ol.layer.Group({
            layers: [
                new ol.layer.Tile({
                    source: new ol.source.BingMaps({
                        imagerySet: 'Road',
                        key: this.bingMapsApiKey
                    })
                }),
                _layerFeatures
            ]
        }));
    } else if (newType == 'BINGMAPS_AERIAL') {
        _map.setLayerGroup(new ol.layer.Group({
            layers: [
                new ol.layer.Tile({
                    source: new ol.source.BingMaps({
                        imagerySet: 'Aerial',
                        key: this.bingMapsApiKey
                    })
                }),
                _layerFeatures
            ]
        }));
    }
};

/**
 * get a coordinateLine with a name; create one, if not yet available
 *
 * @param {string} name the name of the coordinateLine
 *
 * @return {CoordinateLine} the object
 */
JSMapView.prototype.getCoordinateLine = function (name) {
    var coordinateLine = this.coordinateLines[name];
    if (!coordinateLine) {
        coordinateLine = new CoordinateLine();
        this.coordinateLines[name] = coordinateLine;
        this.javaConnector.debug("created CoordinateLine object named " + name);
    }
    return coordinateLine;
};


/**
 * shows a coordinateLine.
 *
 * @param {string} name the name of the coordinateLine
 */
JSMapView.prototype.showCoordinateLine = function (name) {
    this.javaConnector.debug("should show CoordinateLine object named " + name);
    var coordinateLine = this.coordinateLines[name];
    if (coordinateLine && !coordinateLine.getOnMap()) {
        _sourceFeatures.addFeature(coordinateLine.getFeature());
        this.javaConnector.debug("showed CoordinateLine object named " + name);
        coordinateLine.setOnMap(true);
    }
};

/**
 * hides a coordinateLine.
 *
 * @param {string} name the name of the coordinateLine
 */
JSMapView.prototype.hideCoordinateLine = function (name) {
    this.javaConnector.debug("should hide CoordinateLine object named " + name);
    var coordinateLine = this.coordinateLines[name];
    if (coordinateLine && coordinateLine.getOnMap()) {
        _sourceFeatures.removeFeature(coordinateLine.getFeature());
        this.javaConnector.debug("hid CoordinateLine object named " + name);
        coordinateLine.setOnMap(false);
    }
};

/**
 * removes a coordinateLine.
 *
 * @param {string} name the name of the coordinateLine
 */
JSMapView.prototype.removeCoordinateLine = function (name) {
    this.javaConnector.debug("should delete CoordinateLine object named " + name);
    if (this.coordinateLines[name]) {
        this.hideCoordinateLine(name);
        delete this.coordinateLines[name];
        this.javaConnector.debug("deleted CoordinateLine object named " + name);
    }
};

/**
 * adds a marker to the map
 * @param {string} name the name of the marker. must be unique within all markers and labels.
 * @param {string} url the url of the marker's image
 * @param {number} latitude the latitude of the marker's position
 * @param {number} longitude the longitude of the marker's position
 * @param {number} offsetX x-offset of the top left point of the image to the coordinate
 * @param {number} offsetY y-offset of the top left point of the image to the coordinate
 */
JSMapView.prototype.addMarker = function (name, url, latitude, longitude, offsetX, offsetY) {
    var marker = this.mapObjects[name];
    if (!marker) {
        marker = new MapObject(cFromWGS84([longitude, latitude]));
        this.javaConnector.debug('created Marker object named ' + name);

        // add a new <img> element to <div id='markers'>
        var markersElement = document.getElementById('markers');
        var imgElement = document.createElement('img');
        markersElement.appendChild(imgElement);

        imgElement.setAttribute('id', name);
        imgElement.setAttribute('alt', name);
        imgElement.setAttribute('draggable', 'false');
        imgElement.ondragstart = function () {
            return false;
        };
        imgElement.onload = (function () {
            this.javaConnector.debug('image loaded from ' + url);
        }).bind(this);
        imgElement.onerror = (function () {
            this.javaConnector.debug('image load error from ' + url);
        }).bind(this);
        imgElement.src = url;
        this.javaConnector.debug('started loading img from ' + url);

        imgElement.onclick = (function () {
            alert(name + ' clicked');
            this.javaConnector.markerClicked(name);
        }).bind(this);

        var overlay = new ol.Overlay({
            offset: [offsetX, offsetY],
            position: undefined,
            element: imgElement
        });
        marker.setOverlay(overlay);
        _map.addOverlay(overlay);
        this.mapObjects[name] = marker;
    }
};

/**
 * adds a label to the map
 * @param {string} name the name of the Label. must be unique within all markers and labels.
 * @param {string} text the text of the Label
 * @param {string} cssClass the css class for the label
 * @param {number} latitude the latitude of the label's position
 * @param {number} longitude the longitude of the label's position
 * @param {number} offsetX x-offset of the top left point of the image to the coordinate
 * @param {number} offsetY y-offset of the top left point of the image to the coordinate
 */
JSMapView.prototype.addLabel = function (name, text, cssClass, latitude, longitude, offsetX, offsetY) {
    var label = this.mapObjects[name];
    if (!label) {
        label = new MapObject(cFromWGS84([longitude, latitude]));
        this.javaConnector.debug('created Label object named ' + name);

        // add a new <div> element to <div id='labels'>
        var labelsElement = document.getElementById('labels');
        var labelElement = document.createElement('div');
        labelsElement.appendChild(labelElement);

        labelElement.setAttribute('id', name);
        labelElement.setAttribute("class", "mapview-label " + cssClass);
        labelElement.innerHTML = text;

        labelElement.onclick = (function () {
            alert(name + ' clicked');
            this.javaConnector.labelClicked(name);
        }).bind(this);

        var overlay = new ol.Overlay({
            offset: [offsetX, offsetY],
            position: undefined,
            element: labelElement
        });
        label.setOverlay(overlay);
        _map.addOverlay(overlay);
        this.mapObjects[name] = label;
    }
};

/**
 * moves a MapObject to a new position.
 * @param name the name of the MapObject to move
 * @param latitude new latitude
 * @param longitude new longitude
 */
JSMapView.prototype.moveMapObject = function (name, latitude, longitude) {
    var mapObject = this.mapObjects[name];
    if (mapObject) {
        mapObject.setPosition(cFromWGS84([longitude, latitude]));
        if (mapObject.getOnMap()) {
            var overlay = mapObject.getOverlay();
            if (overlay) {
                overlay.setPosition(mapObject.getPosition());
            }
        }
        this.javaConnector.debug('moved ' + name);
    }
};

/**
 * removes a MapObject from the map
 * @param {string} name the name of the MapObject
 */
JSMapView.prototype.removeMapObject = function (name) {
    this.javaConnector.debug('should remove ' + name);
    var mapObject = this.mapObjects[name];
    if (mapObject) {
        this.hideMapObject(mapObject);
        var overlay = mapObject.getOverlay();
        if (overlay) {
            _map.removeOverlay(overlay);
            var element = overlay.getElement();
            if (element) {
                delete element;
            }
            delete overlay;
        }
        delete this.mapObjects[name];
        this.javaConnector.debug('removed ' + name);
    }
};

/**
 * hides a MapObject from the map. the overlay is set to an undefined position which removes it from the map
 * @param {string} name the name of the MapObject
 */
JSMapView.prototype.hideMapObject = function (name) {
    this.javaConnector.debug("should hide " + name);
    var mapObject = this.mapObjects[name];
    if (mapObject && mapObject.getOnMap()) {
        var overlay = mapObject.getOverlay();
        if (overlay) {
            overlay.setPosition(undefined);
        }
        mapObject.setOnMap(false);
        this.javaConnector.debug("hid " + name);
    }
};


/**
 * shows a MapObject.
 * @param name the name of the MapObject to show
 */
JSMapView.prototype.showMapObject = function (name) {
    this.javaConnector.debug("should show " + name);
    var mapObject = this.mapObjects[name];
    if (mapObject && !mapObject.getOnMap()) {
        var overlay = mapObject.getOverlay();
        if (overlay) {
            overlay.setPosition(mapObject.getPosition());
        }
        mapObject.setOnMap(true);
        this.javaConnector.debug("showed " + name);
    }
};

/**
 * sets the bing maps api key
 * @param apiKey the api key
 */
JSMapView.prototype.setBingMapsApiKey = function (apiKey) {
    this.bingMapsApiKey = apiKey;
};

/**
 * @return JSMapView object
 */
function getJSMapView() {
    var jsMapView = new JSMapView(_javaConnector);
    jsMapView.init();
    return jsMapView;
}


