'use strict';

var reqRegEx = /^\s*(?:\{(.*)\})?\s*(?:(\$?[^\s]+))?\s*(?:\((.*)\))?\s*(?:-?\s*([^<$]*))?\s*(?:<?\s*(.*)\s*>)?$/;

var utils = require('../../utils');
var logger = require('../../log');
var uniq = require('lodash').uniq;


var searchForMatches = function(code, regex, index){
  var match;
  var matches = [];
  while ( (match = regex.exec(code)) ) {
    matches.push(match[index || 1]);
  }
  return uniq(matches);
};


var typeNameObject = function(type){
  return function(name){
    return {
      type : type,
      name : name,
      autofill : true
    };
  };
};

var compareBefore = function(code, str, index){
  for (var i=index-str.length,b=0;i<index;i++){
    if (code[i] !== str[b]){
      return false;
    }
    b++;
  }
  return true;
};

module.exports = {

  parse: function (text) {
    var match = reqRegEx.exec(text.trim());

    var obj = {
      type: match[1] || 'function',
      name: match[2]
    };

    obj.external = utils.splitNamespace(obj.name).length > 1;

    if (obj.name.indexOf('$') === 0) {
      obj.type = 'variable';
      obj.name = obj.name.slice(1);
    }

    if (obj.name.indexOf('%') === 0) {
      obj.type = 'placeholder';
      obj.name = obj.name.slice(1);
    }

    if (match[4]) {
      obj.description = match[4].trim();
    }

    if (match[5]) {
      obj.url = match[5];
    }

    return obj;
  },

  autofill: function(item){
    var type = item.context.type;
    if (type === 'mixin' || type === 'placeholder' || type === 'function') {

      // Searching for mixins and functions
      var mixins = [];
      var functions = [];
      var mixinFunctionRegex = /\s*([\w\d_-]*)\(/g;
      var match;
      while ( (match = mixinFunctionRegex.exec(item.context.code)) ){
        // Try if this is a mixin or function
        if (compareBefore(item.context.code, '@include', match.index)){
          mixins.push(match[1]);
        } else {
          functions.push(match[1]);
        }
      }

      var placeholders = searchForMatches(item.context.code, /@extend\s+%([^;\s]+)/ig);
      var variables    = searchForMatches(item.context.code, /\$([a-z0-9_-]+)/ig);

      // Create object for each required item.
      mixins       = mixins.map(typeNameObject('mixin'));
      functions    = functions.map(typeNameObject('function'));
      placeholders = placeholders.map(typeNameObject('placeholder'));
      variables    = variables.map(typeNameObject('variable'));


      // Merge all arrays
      var all = [];
          all = all.concat(mixins);
          all = all.concat(functions);
          all = all.concat(placeholders);
          all = all.concat(variables);

      // Merge in user supplyed requires if there are any
      if (item.require && item.require.length > 0){
        all = all.concat(item.require);
      }

      if (all.length > 0){
        return all;
      }
    }
  },

  resolve: function (byTypeAndName) {
    utils.eachItem(byTypeAndName, function (item) {
      if (utils.isset(item.require)) {
        item.require = item.require.map(function (req) {
          if (req.external === true) {
            return req;
          }

          if (utils.isset(byTypeAndName[req.type]) &&
              utils.isset(byTypeAndName[req.type][req.name])) {

            var reqItem = byTypeAndName[req.type][req.name];

            if (!Array.isArray(reqItem.usedBy)) {
              reqItem.usedBy = [];
              reqItem.usedBy.toJSON = utils.mapArray.bind(null, reqItem.usedBy,
                function (item) {
                  return {
                    description: item.description,
                    context: item.context
                  };
                }
              );
            }
            reqItem.usedBy.push(item);
            req.item = reqItem;

          }
          else if (req.autofill !== true) {
            logger.log('Item `' + item.context.name +
              '` requires `' + req.name + '` from type `' + req.type +
              '` but this item doesn\'t exist.');
          }

          return req;
        });

        item.require.toJSON = utils.mapArray.bind(null, item.require,
          function (item) {
            var obj = {
              type: item.type,
              name: item.name,
              external : item.external,
            };
            if (item.external) {
              obj.url = item.url;
            }
            else {
              obj.description = item.description;
              obj.context = item.context;
            }
            return obj;
          }
        );
      }
    });

  },

  alias: ['requires']
};