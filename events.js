var io = require('socket.io-client');
var mainDebug = require("debug")("stresstest:events");
var printerDebug = require("debug")("stresstest:events:printer");
var appDebug = require("debug")("stresstest:events:app");
var utils = require("./utils");

var env = process.env;
var url = env.URL || "https://cloud.doodle3d.com";
//var url = env.URL || "http://cloud.doodle3d.com:5003";
//var url = env.URL || "http://localhost:5000";
var numClients = parseInt(env.NUM || 100); 
var initInterval = parseInt(env.INIT_INTERVAL || 500);
var initRandom = parseInt(env.INIT_RANDOM || 500);
var emitInterval = parseInt(env.INTERVAL || 500);

initInterval = initInterval+Math.random()*initRandom;
mainDebug("initInterval: ",initInterval);
mainDebug("emitInterval: ",emitInterval);

var index = 0;
var d = require('domain').create();
d.on('error', function(err) {
  mainDebug('Domain error: ', err.message);
});
d.run(createNext);
function createNext() {
  mainDebug("index: "+index);
  new Printer(index,function(err,nspName) {
    new App(index,nspName);
  });
  index++;
  if(index < numClients) {
    setTimeout(createNext,initInterval);
  }
}

function Printer(index,callback) {
  var debug = printerDebug;
  var _key;
  var _self = this;
  var _networkSocket;
  //debug(index+": init");
  utils.printerRegister(url,function(err,key,id) {
    if(err) return debug("register err: ",err);
    //debug(index+": registered");
    _key = key;
    var rootSocket = connect('/');
    rootSocket.once('connect',function() {
      //debug(index+": /: connected"); 
      var nspName = '/'+id+'-network';
      _networkSocket = connect(nspName);
      _networkSocket.once('connect',function() {
        //debug(index+": /webcam: connected");
        callback(null,nspName);
        if(emitInterval === -1) {
          _self.sendEvent();
        } else {
          setInterval(_self.sendEvent,emitInterval);
        }
      });
      _networkSocket.on('error',function(err) {
        debug(index+": /network: error: ",err.message); 
      });
    });
    rootSocket.on('error',function(err) {
      debug(index+": /: error: ",err.message); 
    });
  });
  this.sendEvent = function() {
    debug(index+": emit someState"); 
    _networkSocket.emit('someState', {state: 'mystate'});
  };
  function connect(nsp) {
    return io.connect(url+nsp+'?type=printer&key='+_key, {forceNew:true});
  }
}
                
function App(index,nspName) {
  var debug = appDebug;
  var _key;
  //debug(index+": init: ",nspName);
  utils.userRegister(url,function(err,key,id) {
    if(err) return appDebug("register err: ",err);
    //debug(index+": registered");
    _key = key;
    var networkSocket = connect(nspName);
    networkSocket.once('connect',function() {
      //debug(index+": /webcam: connected");
      networkSocket.on('someState',function(data) {
        debug(index+": someState: ",data); 
      });
    });
    networkSocket.on('error',function(err) {
      debug(index+": /network: error: ",err.message); 
    });
  });
  function connect(nsp) {
    return io.connect(url+nsp+'?key='+_key, {forceNew:true});
  }
}