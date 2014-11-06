var io = require('socket.io-client');
var ss = require('socket.io-stream');
var path = require('path');
var fs = require('fs');
var mainDebug = require("debug")("stresstest:print");
var printerDebug = require("debug")("stresstest:print:printer");
var appDebug = require("debug")("stresstest:print:app");
var utils = require("./utils");
var ms = require("ms");

var env = process.env;
var url = env.URL || "https://cloud.doodle3d.com";
//var url = env.URL || "http://cloud.doodle3d.com:5002";
//var url = env.URL || "http://localhost:5000";
var numClients = parseInt(env.NUM || 100);
var initInterval = parseInt(env.INIT_INTERVAL || 3000);
var initRandom = parseInt(env.INIT_RANDOM || 3000);
var emitInterval = parseInt(env.INTERVAL || 5*60*1000);
var emitIntervalRandom = parseInt(env.INTERVAL_RANDOM || 2000);
var file = env.FILE || "file.stl";


initInterval = initInterval+Math.random()*initRandom;
if(emitInterval != -1) emitInterval = emitInterval+Math.random()*emitIntervalRandom;
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
//createNext();
function createNext() {
  create(index);
  index++;
  if(index < numClients) {
    createNextTimeout = setTimeout(createNext,initInterval);
  }
}
function create(index) {
  mainDebug("index: "+index);
  new Printer(index,function(err,nspName) {
    new App(index,nspName);
  });
}


function Printer(index,callback) {
  var debug = printerDebug;
  //debug(index+": init");
  utils.printerRegister(url,function(err,key,id) {
    if(err) return debug("register err: ",err);
    //debug(index+": registered");
    var rootSocket = connect('/',key,"printer");
    rootSocket.once('connect',function() {
      //debug(index+": /: connected"); 
      var nspName = '/'+id+'-printer';
      var printerSocket = connect(nspName,key,"printer");
      printerSocket.once('connect',function() {
        //debug(index+": /printer: connected");
        callback(null,nspName);
        var streamSocket = ss(printerSocket);
        streamSocket.on('print',function(stream,data) {
          //debug(index+": print: ",data.name); 
          var filename = path.basename(data.name);
          filename = "received/"+index+":"+filename;
          var writeStream = fs.createWriteStream(filename);
          stream.pipe(writeStream);
          writeStream.on('error',function(err) {
            debug("writeStream error: ",err.message);
          });
        });
      });
      printerSocket.on('error',function(err) {
        debug(index+": /printer: error: ",err.message); 
      });
    });
    rootSocket.on('error',function(err) {
      debug(index+": /: error: ",err.message); 
    });
  });
}
                
function App(index,nspName) {
  var debug = appDebug;
  var _sending = false;
  var _self = this;
  var _key;
  //debug(index+": init: ",nspName);
  utils.userRegister(url,function(err,key,id) {
    if(err) return appDebug("register err: ",err);
    //debug(index+": registered");
    _key = key;
    if(emitInterval === -1) {
      _self.sendFile();
    } else {
      _self.sendFile();
      var interval = setInterval(_self.sendFile,emitInterval);
      emitIntervals.push(interval);
    }
  });
  
  this.sendFile = function() {
    //debug(index+": sendFile"); 
    var socket = connect(nspName,_key);
    var streamSocket = ss(socket);
    socket.once('connect',function() {
      //debug(index+": connected"); 
      if(_sending) return debug("still sending previous file");
      _sending = true;
      var startTime = Date.now();
      var filename = file;
      var stream = ss.createStream();
      debug(index+": emit print"); 
      streamSocket.emit('print', stream, {name: filename});
      var readStream = fs.createReadStream(filename);
      readStream.pipe(stream);
      readStream.on('error',function(err) {
        debug("readStream error: ",err.message);
      });
      stream.on("end",function() {
        var elapsed = ms(Date.now()-startTime);
        debug(index+":  print send in: ",elapsed);
        _sending = false;
      });
    });
    socket.on('error',function(err) {
      debug(index+": /printer: error: ",err.message); 
    });
    var rootSocket = connect('/',_key);
    rootSocket.on('error',function(err) {
      debug(index+": /: error: ",err.message); 
    });
  };
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