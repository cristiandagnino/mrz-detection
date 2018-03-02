var {Image} = require('image-js');
var fs = require('fs');
var path = require('path');
var strokeWidthTransform = require('stroke-width-transform');

async function loadModel() {
  var XGBoost = await require('ml-xgboost');
  var labels = JSON.parse(fs.readFileSync('./src/classifier/models/labels.json', 'utf8'));

  var model = XGBoost.loadFromModel('./src/classifier/models/ocr-letter.model', {
    labels
  });
  return model;
}

async function detect(model, filename, saveDir) {
  const letterOptions = {
    width: 20,
    height: 27
  };

  const roiOptions = {
    positive: true,
    negative: false,
    minRatio: 0.5,
    maxRatio: 2.0,
    algorithm: 'isodata',
    randomColors: true
  };

  const swtOptions = {
    scaleInvariant: false,
    breakdown: false,
    size: 5,
    aspectRatio: 5,
    lowThresh: 100,
    highThresh: 300,
    heightRatio: 2,
    distanceRatio: 4,
    thicknessRatio: 2.0,
  };

  var testImage = (await Image.load(filename));/*.gaussianFilter({
    radius: 2
  });*/
  // getAllMethods(testImage);
  console.log(`filename: ${filename}`);
  console.time("SWT time");
  var rois = strokeWidthTransform(testImage, swtOptions);
  console.timeEnd("SWT time")

  drawRois(testImage, rois);
  var masks = new Array(rois.length);
  for (var i = 0; i < rois.length; ++i) {
    masks[i] = testImage.extract(rois[i].getMask()).grey();
  }

  var predictions = new Array(masks.length);

  

  for (i = 0; i < masks.length; ++i) {
    var newImage = masks[i];
    try {
      var mask = newImage.mask({
        algorithm: roiOptions.algorithm,
        invert: true
      });
    } catch(e) {
      console.log("No threshold found, continue...");
      continue;
    }
    

    var manager = newImage.getRoiManager();
    manager.fromMask(mask);
    var currentRois = manager.getRois(roiOptions);

    drawRois(newImage, currentRois, [0, 255, 0]);
    
    
    if(currentRois.length === 0) {
      predictions[i] = {
        image: newImage,
        prediction: []
      };
      continue;
    }
    var toPredict = new Array(currentRois.length);
    for (var j = 0; j < currentRois.length; ++j) {
      var scaledMask = currentRois[j].getMask().scale({
        width: letterOptions.width,
        height: letterOptions.height
      });
      toPredict[j] = getBinaryArray(scaledMask);
    }
    var timeLabel = `Prediction time for ${toPredict.length} ROI's`
    console.time(timeLabel);
    var output = model.predict(toPredict);
    console.timeEnd(timeLabel);

    predictions[i] = {
      image: newImage,
      prediction: output
    };
  }

  return {
    testImage,
    predictions,
  }
}

function getBinaryArray(mask) {
  var width = mask.width;
  var height = mask.height;
  var output = [];
  for (var x = 0; x < height; ++x) {
    for (var y = 0; y < width; ++y) {
      output.push(mask.getBitXY(y, x));
    }
  }

  return output;
}

function drawRois(image, rois, color=[255, 0, 0]) {
  rois.forEach(function (roi) {
    var small = roi.getMask();
    roi.data = Array.from(small.data);

    // draw bounding boxes
    var mask = roi.getMask();

    var mbr = mask.minimalBoundingRectangle();

    mbr = mbr.map((point) =>
      [
        point[0] + mask.position[0],
        point[1] + mask.position[1]
      ]
    );
    image.paintPolyline(mbr, { color });
  });

  return image;
}

module.exports = {
  loadModel,
  detect
}