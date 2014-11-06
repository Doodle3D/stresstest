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
var createNextTimeout;
var sockets = [];
var emitIntervals = [];
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
    createNextTimeout = setTimeout(createNext,initInterval);
  }
}

function Printer(index,callback) {
  var debug = printerDebug;
  var _self = this;
  var _networkSocket;
  //debug(index+": init");
  utils.printerRegister(url,function(err,key,id) {
    if(err) return debug("register err: ",err);
    //debug(index+": registered");
    var rootSocket = connect('/',key,"printer");
    rootSocket.once('connect',function() {
      //debug(index+": /: connected"); 
      var nspName = '/'+id+'-network';
      _networkSocket = connect(nspName,key,"printer");
      _networkSocket.once('connect',function() {
        //debug(index+": /webcam: connected");
        callback(null,nspName);
        if(emitInterval === -1) {
          _self.sendEvent();
        } else {
          var interval = setInterval(_self.sendEvent,emitInterval);
          emitIntervals.push(interval);
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
}
                
function App(index,nspName) {
  var debug = appDebug;
  //debug(index+": init: ",nspName);
  utils.userRegister(url,function(err,key,id) {
    if(err) return appDebug("register err: ",err);
    //debug(index+": registered");
    var networkSocket = connect(nspName,key);
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
}

function connect(nsp,key,type) {
  var nspURL = url+nsp+'?key='+key;
  if(type !== undefined) nspURL += "&type="+type;
  var socket = io.connect(nspURL, {forceNew:true});
  sockets.push(socket);
  return socket;
}

process.on('SIGINT', gracefullShutdown);
process.on('SIGTERM', gracefullShutdown);
function gracefullShutdown() {
  mainDebug("gracefullShutdown");
  // stop creating new
  clearTimeout(createNextTimeout);
  // stop emits
  for(var i in emitIntervals) {
    clearInterval(emitIntervals[i]);
  }
  // slowly disconnect sockets
  var index = sockets.length;
  disconnectNext();
  function disconnectNext() {
    index--;
    mainDebug(  "disconnect: ",index);
    sockets[index].disconnect();
    if(index > 0) setTimeout(disconnectNext,100);
    else process.exit(1);
  }
}