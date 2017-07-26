var zoom = 6;
var coord1 = 55.755773;
var coord2 = 37.617761;
// Создание экземпляра карты и его привязка к созданному контейнеру
var map = new ymaps.Map("cont_map_adress_by_id_map", {
	// Центр карты
	center: [coord1, coord2],
	// Коэффициент масштабирования
	zoom: zoom,
	// Тип карты
	type: "yandex#map",
	// включаем масштабирование карты колесом
	behaviors: ['default', 'scrollZoom']
});
// Добавление стандартного набора кнопок
map.controls.add("mapTools").add("zoomControl").add("typeSelector");



// параметр map не обязателен, его можно установить асинхпронно через setMap
// @param map - инстанс яндекс карты
function LocationFilter(map){
    this.map = map||window.map;
    this.enabled = false;
}

// установка ссылки на карту
// @param map - инстанс яндекс карты
LocationFilter.prototype.setMap = function(map){
	this.map = map;
	if(this.waitMap){
		this.enable();
		this.moveHandler();
	}
	this.waitMap = false;
}


// Активация отображения терминалов на карте в пределах видимой области карты
// @param geolocation - если true - карты будет сфокусирована на текущей геолокации пользователя
LocationFilter.prototype.enable = function(geolocation) {
    if(this.enabled) return;
    if(!this.map){
    	this.waitMap = true;
    	return;
    }
    this.enabled = !this.enabled;
    this.handlingEvent(true);
    if(geolocation) this.geolocation();
};

// Деактивация отображения терминалов на карте
LocationFilter.prototype.disable = function() {
    if(!this.enabled) return;
    this.enabled = !this.enabled;
    this.handlingEvent(false);
};

// фокусировка карты на геолокации пользователя
LocationFilter.prototype.geolocation = function() {
    var self = this;
    this.handlingEvent(false);
    this.focus_map_to_geolocation(this.map, function(){
        self.handlingEvent(true);
        self.moveHandler();
    })
};

// Вкличение отключение обработки событий карты в зависимости от флага handling_on
LocationFilter.prototype.handlingEvent = function(handling_on){
    var method = handling_on?"add":"remove";
    this.map.events[method]("actionend", this.moveHandler,this);
}


// Фокусировка карты на геопозиции пользователя
LocationFilter.prototype.focus_map_to_geolocation = function(_map, cb){
    var map = _map||this.map;

    function _processSuccess(geoposition){
        window.coord = geoposition.coords
        var circleGeometry = new ymaps.geometry.Circle([geoposition.coords.latitude, geoposition.coords.longitude], geoposition.coords.accuracy);
        circleGeometry.setMap(map);
        circleGeometry.options.setParent(map.options);
        var bounds = circleGeometry.getBounds();
        var size = map.container.getSize()
        
        var config = ymaps.util.bounds.getCenterAndZoom(bounds,size);
        config.zoom = config.zoom-1
        _configure(config);
    }

    function _processFailback(){
        var config = {
            zoom:ymaps.geolocation.zoom,
            center:[ymaps.geolocation.latitude,ymaps.geolocation.longitude]
        };

        _configure(config);
    }

    function _configure(config){
        map.setZoom(config.zoom)
        map.panTo(config.center,{
            callback:cb||function(){},
            duration:1000,
            flying:true
        })
    }

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(_processSuccess, _processFailback);
    }else{
        _processFailback();
    }
}

// обертка для вызова обработчика движения карты
LocationFilter.prototype.moveHandler = function(){
    this.bounds = this.map.getBounds();
    var handler = this.handler || function(){};
    handler.call(this.map, this.bounds);

}

// установка обработчика движения карты
LocationFilter.prototype.setHandler= function(handler){
	if(!(handler instanceof Function)) throw new Error("handler not a function");
	this.handler = handler;
}


var terminalFilter = new LocationFilter(window.map);

var terminalExpired = new Date().getTime() - 10800000;
var collection = null;


// обработчик движения карты
function handler(bounds){
	var payload = {
		latNW:bounds[1][0],
		latSE:bounds[0][0],
		lngNW:bounds[0][1],
		lngSE:bounds[1][1],
		zoom:this.getZoom()
	}
	if(!collection){
		collection = new ymaps.GeoObjectCollection({},{preset:'twirl#redIcon'});
		this.geoObjects.add(collection);
	}

	$.get('https://edge.qiwi.com/locator/nearest/clusters',payload).then(function(resp){

		if(!(resp instanceof Array)) return;

		var terminals = []
		
		for(var i in resp){
			try{
				if(new Date(resp[i].lastActive).getTime() < terminalExpired) continue;
				terminals.push(resp[i]);
			}catch(_){
				continue;
			}
		}

		collection.removeAll();
		for (var i in terminals){
			var count = terminals[i].count-1;
			if((count/1000)>1)  count =  Math.round(count/1000)+"K";
			var labelLength = String(count).length;
			var offset = 0;
			switch(labelLength){
				case 1: offset = 0.5;break;
				case 2: offset = 0.3;break;
			}
			var term_point = new ymaps.Placemark([
				terminals[i].coordinate['latitude'], 
				terminals[i].coordinate['longitude']], 
				{
					iconContent: count?'<div style="margin-left:'+offset+'em;color:#fff">'+(/K/.test(count)?count:+count+1)+'</div>':"",
					balloonContent: terminals[i].address.fullAddress+(count?("<br/>и "+count+" неподалеку"):""),
					balloonContentHeader:terminals[i].ttpId===4?"Терминал QIWI":"Терминал партнера QIWI"
				},
				{
					draggable: false,
					hideIconOnBalloonOpen: true,
		            //iconLayout: polygonLayout,//'default#image',
		            //iconContentSize:20,
		            iconImageHref: '/images/ico/terminal'+(count?"-blank":"")+'.png',
		            iconImageSize: [35, 37],
		            iconImageOffset: [-17, -37]
				});
			collection.add(term_point);
		}
	})
}

terminalFilter.setHandler(handler);
terminalFilter.enable();




