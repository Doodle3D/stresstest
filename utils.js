var request = require('request');
var debug = require('debug')('stresstest:utils');

function register(url,json,callback) {
  request.post({url:url, json:json}, function(err, httpResponse, body) {
    if(err) return callback(new Error("printer register error: "+err),null);
    if(typeof body !== "object") {
      return callback(new Error("invalid register response: ",body),null,null);
    }
    callback(null,body.key,body.id);
  });
}

module.exports.userRegister = function(url,callback) {
  register(url+"/user/register",{},callback);
};
module.exports.printerRegister = function(url,callback) {
  var json = {
    name:"stressstest-printer",
    features: ["printer","network","debug","update","config","webcam","slice"]
  };
  register(url+"/printer/register",json,callback);
};