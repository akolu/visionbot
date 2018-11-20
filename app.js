'use strict';
const irc = require('irc');
const Promise = require('bluebird');
const request = require('request');
const config = require('./config');
const fs = require('fs');
const size = require('request-image-size');

/**
 * Starts with 'http://', 'https://' or 'www.', contains non-whitespace characters until
 * a supported file extension and optional dash at the end is found
 */
const IMAGE_PATTERN = /((http(s)?:\/\/|www\.)\S+\.(jpeg|jpg|tiff|png|gif|bmp|svg)[\/]?)/g;
const URL_PATTERN = /((http(s)?:\/\/|www\.)\S*)/g;
const MIN_IMAGE_SIZE = 90000; //equivalent of 300 x 300 px
const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate?key=';
const VISION_API_KEY = fs.readFileSync('api.key');
const SAFE_SEARCH_LIKELIHOOD = ['UNKNOWN', 'VERY_UNLIKELY', 'UNLIKELY', 'POSSIBLE', 'LIKELY', 'VERY_LIKELY'];

let bot = new irc.Client(config.irc.server, config.irc.nick, config.irc.options);

bot.addListener('message', function (from, to, text, message) {
  let matches = text.match(URL_PATTERN) || [];
  matches.forEach(img => {
    processUrl(img)
      .then(json => {

        let analysisMessage = buildNSFWMessage(json) + buildAnalysisMessage(json);
        bot.say(to, analysisMessage);

      }).catch(err => {
        console.log(err);
        bot.say(to, 'Could not process image :(');
      });
  });
});

bot.addListener('error', function (message) {
  console.log('Bot error: ', message);
});

bot.addListener('registered', function (message) {
  console.log(`Connected to server ${message.server}`);
});

bot.addListener('invite', function (channel, by, mode, argument, message) {
  bot.join(channel, () => console.log(`Joining channel ${channel} from invitation of ${by}.`))
});

function processUrl(url) {
  return Promise.promisify(request.get)({url: url})
    .then(getImageUrlFromHttpResponse)
    .then(url => url.length === 0 ? Promise.resolve() : getBase64ImageFromUrl(url).then(getImageDetailsFromVisionApi));

  function getBase64ImageFromUrl(url) {
    console.log(`Processing image ${url}`);
    return Promise.promisify(request.get)({url: url, encoding: null})
      .then(response => response.body.toString('base64'))
      .catch(err => {
        console.log('Error!', err.statusCode + ': ' + err.statusMessage);
      });
  }

  function getImageUrlFromHttpResponse(response) {
    if (response.headers['content-type'].indexOf('image') !== -1) {
      return url; //if content-type is image already, no need to parse
    }
    let matches = response.body.match(IMAGE_PATTERN) || [];
    matches = matches.filter(function (item, pos) {
      return matches.indexOf(item) == pos;
    });
    return Promise.all(matches.map(url => getSize(url)))
      .then(result => {
        const sorted = result.filter(item => item.size >= MIN_IMAGE_SIZE).sort((a, b) => b.size - a.size);
        return sorted.length > 0 ? sorted[0].url : '';
      })
      .catch(err => {
        throw new Error(`Could not fetch image(s) from ${url}`);
      });
  }

  function getSize(url) {
    return Promise.promisify(size)({url: url, headers: {'User-Agent': 'request-image-size'}})
      .then((dimensions, length) => {
        return {url: url, size: dimensions.width * dimensions.height};
      })
      .catch(err => {
        return {url: null, size: 0};
      });
  }

  function getImageDetailsFromVisionApi(base64String) {
    return Promise.promisify(request.post)({
      url: VISION_API_URL + VISION_API_KEY,
      headers: {'Content-Type': 'application/json'},
      body: createVisionApiRequestBody(base64String)
    }).then(response => {
      let json = JSON.parse(response.body);
      if (json.responses[0].error) {
        throw new Error(json.responses[0].error.message);
      }
      return json;
    }).catch(err => {
      console.log('Vision API error!', err);
    });
  }

  function createVisionApiRequestBody(base64String) {
    return JSON.stringify({
      'requests': [{
        'image': {
          'content': base64String
        },
        'features': [
          {'type': 'LABEL_DETECTION', 'maxResults': 5},
          {'type': 'SAFE_SEARCH_DETECTION', 'maxResults': 1}
        ]
      }]
    })
  }
}

function parseSafeSearch(json) {
  let categories = ['adult', 'spoof', 'medical', 'violence'];
  let safeSearch = [];
  categories.forEach(category => {
    if (json != null && isSafeSearchContent(json, category)) {
      safeSearch.push(category);
    }
  });
  return safeSearch;

  function isSafeSearchContent(json, category) {
    let likelihoodResult = SAFE_SEARCH_LIKELIHOOD.indexOf(json.responses[0].safeSearchAnnotation[category]);
    let safeSearchTolerance = SAFE_SEARCH_LIKELIHOOD.indexOf(config.safeSearchTolerance[category]);
    return safeSearchTolerance !== -1 && likelihoodResult >= safeSearchTolerance;
  }
}

function parseLabels(json) {
  let labels = [];
  if (json != null) {
    let labelAnnotations = json.responses[0].labelAnnotations || [];
    labelAnnotations.forEach(label => {
      labels.push(label.description);
    });
    if (labels.length === 0) {
      labels.push('VisionAPI lookup failed (no data).');
    }
  }
  return labels;
}

function buildNSFWMessage(json){
  //warn about nsfw content
  let safeSearch = parseSafeSearch(json);

  if (safeSearch.length > 0) {
    return `Possibly NSFW! (${safeSearch.join(', ') }). `;
  }
  return '';
}

function buildAnalysisMessage(json){
  //analyze image
  let labels = parseLabels(json);

  if (labels.length > 0) {
    return `Image analysis: ${labels.join(', ')}.`;
  }
  return '';
}
