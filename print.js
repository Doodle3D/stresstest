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
var initRandom = parseInt(env.INIT_RANDOM) || 3000;
var emitInterval = parseInt(env.INTERVAL) || 5*60*1000;
var emitIntervalRandom = parseInt(env.INTERVAL_RANDOM) || 2000;
var file = env.FILE || "file.stl";


initInterval = initInterval+Math.random()*initRandom;
if(emitInterval != -1) emitInterval = emitInterval+Math.random()*emitIntervalRandom;
mainDebug("initInterval: ",initInterval);
mainDebug("emitInterval: ",emitInterval);

var index = 0;
createNext();
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
  //debug(index+": init");
  utils.printerRegister(url,function(err,key,id) {
    if(err) return debug("register err: ",err);
    //debug(index+": registered");
    _key = key;
    var rootSocket = connect('/');
    rootSocket.once('connect',function() {
      //debug(index+": /: connected"); 
      var nspName = '/'+id+'-printer';
      var printerSocket = connect(nspName);
      printerSocket.once('connect',function() {
        //debug(index+": /printer: connected");
        callback(null,nspName);
        var streamSocket = ss(printerSocket);
        streamSocket.on('print',function(stream,data) {
          //debug(index+": print: ",data.name); 
          var filename = path.basename(data.name);
          filename = "received/"+index+":"+filename;
          stream.pipe(fs.createWriteStream(filename));
        });
      });
      printerSocket.once('error',function(err) {
        debug(index+": /printer: error: ",err); 
      });
    });
    rootSocket.once('error',function(err) {
      debug(index+": /: error: ",err); 
    });
  });
  function connect(nsp) {
    return io.connect(url+nsp+'?type=printer&key='+_key, {forceNew:true});
  }
}
                
function App(index,nspName) {
  var debug = appDebug;
  var _key;
  var _sending = false;
  var _self = this;
  //debug(index+": init: ",nspName);
  utils.userRegister(url,function(err,key,id) {
    if(err) return appDebug("register err: ",err);
    //debug(index+": registered");
    _key = key;
    
    if(emitInterval === -1) {
      _self.sendFile();
    } else {
      setInterval(_self.sendFile,emitInterval);
    }
  });
  
  this.sendFile = function() {
    //debug(index+": sendFile"); 
    var socket = connect(nspName);
    var streamSocket = ss(socket);
    socket.once('connect',function() {
      //debug(index+": connected"); 
      if(_sending) return;
      _sending = true;
      var startTime = Date.now();
      var filename = file;
      var stream = ss.createStream();
      debug(index+": emit print"); 
      streamSocket.emit('print', stream, {name: filename});
      fs.createReadStream(filename).pipe(stream);
      stream.on("end",function() {
        var elapsed = ms(Date.now()-startTime);
        debug(index+":  print send in: ",elapsed);
        _sending = false;
      });
    });
    socket.once('error',function(err) {
      debug(index+": error: ",err); 
    });
  };
  function connect(nsp) {
    return io.connect(url+nsp+'?key='+_key, {forceNew:true});
  }
}