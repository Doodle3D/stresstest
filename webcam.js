var io = require('socket.io-client');
var ss = require('socket.io-stream');
var path = require('path');
var fs = require('fs');
var mainDebug = require("debug")("stresstest:webcam");
var printerDebug = require("debug")("stresstest:webcam:printer");
var appDebug = require("debug")("stresstest:webcam:app");
var utils = require("./utils");
var ms = require("ms");

var env = process.env;
var url = env.URL || "https://cloud.doodle3d.com";
//var url = env.URL || "http://cloud.doodle3d.com:5003";
//var url = env.URL || "http://localhost:5000";
var numClients = parseInt(env.NUM || 20); //EMFILE after 29. wish: 500
var initInterval = parseInt(env.INIT_INTERVAL || 1000);
var initRandom = parseInt(env.INIT_RANDOM || 2000);
var emitInterval = parseInt(env.INTERVAL || 1000);
var file = env.FILE || "file0.jpg";

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
  var _key;
  var _sending = false;
  var _streamSocket;
  var _self = this;
  //debug(index+": init");
  utils.printerRegister(url,function(err,key,id) {
    if(err) return debug("register err: ",err);
    //debug(index+": registered");
    _key = key;
    var rootSocket = connect('/',key,"printer");
    rootSocket.once('connect',function() {
      //debug(index+": /: connected"); 
      var nspName = '/'+id+'-webcam';
      var webcamSocket = connect(nspName,key,"printer");
      webcamSocket.once('connect',function() {
        //debug(index+": /webcam: connected");
        callback(null,nspName);
        _streamSocket = ss(webcamSocket);
        _streamSocket.on('error',function(err) {
          debug(index+": /webcam stream: error: ",err.message); 
        });
        if(emitInterval === -1) {
          _self.sendFile();
        } else {
          var interval = setInterval(_self.sendFile,emitInterval);
          emitIntervals.push(interval);
        }
        
      });
      webcamSocket.on('error',function(err) {
        debug(index+": /webcam: error: ",err.message); 
      });
    });
    rootSocket.on('error',function(err) {
      debug(index+": /: error: ",err.message); 
    });
  });
  this.sendFile = function() {
    //debug(index+": sendFile"); 
    if(_sending) return;
    _sending = true;
    var startTime = Date.now();
    var filename = file;
    var stream = ss.createStream();
    //debug(index+": emit image"); 
    _streamSocket.emit('image', stream, {name: filename});
    var readStream = fs.createReadStream(filename);
    readStream.pipe(stream);
    readStream.on('error',function(err) {
      debug("readStream error: ",err.message);
    });
    stream.on("end",function() {
      var elapsed = ms(Date.now()-startTime);
      debug("emitted image in: "+elapsed);
      _sending = false;
    });
  };
}
                
function App(index,nspName) {
  var debug = appDebug;
  var _key;
  //debug(index+": init: ",nspName);
  utils.userRegister(url,function(err,key,id) {
    if(err) return appDebug("register err: ",err);
    //debug(index+": registered");
    _key = key;
    var webcamSocket = connect(nspName,key);
    webcamSocket.once('connect',function() {
      //debug(index+": /webcam: connected");
      var streamSocket = ss(webcamSocket);
      streamSocket.on('image',function(stream,data) {
        //debug(index+": image: ",data.name); 
        var filename = path.basename(data.name);
        //filename = "received/"+index+":"+filename;
        filename = "received/"+filename;
        var writeStream = fs.createWriteStream(filename);
        stream.pipe(writeStream);
        writeStream.on('error',function(err) {
          debug("writeStream error: ",err.message);
        });
      });
    });
    webcamSocket.on('error',function(err) {
      debug(index+": /webcam: error: ",err.message); 
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