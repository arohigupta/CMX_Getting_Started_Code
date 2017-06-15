var Jimp = require("jimp");
var request = require("request");

var baseCMXUrl = process.env.baseCMXUrl || 'https://cmxlocationsandbox.cisco.com'
var macAddress = process.env.macAddress || '00:00:2a:01:00:27'
var CMXusername = process.env.CMXusername || 'learning'
var CMXpassword = process.env.CMXpassword || 'learning'

var indicatorImage = './images/green-indicator.png'

var mapData = {}  //Object to store all our location data from CMX 

function getLocationData() {
    console.log('Getting location data for '+macAddress)
    return new Promise(function(resolve, reject) {
        var options = { method: 'GET',
          url: baseCMXUrl + '/api/location/v1/clients/' + macAddress,
          auth: {
            'user': CMXusername,
            'pass': CMXpassword
          }
        }

        request(options, function (error, response, body) {
            if (error) {
                reject('Error in making request to CMX');
            }

            else {

                if(response.statusCode != 200) {
                    reject('Error in making request to CMX.  HTTP Response code is: '+response.statusCode+'.\n Response Body is: '+body)
                }
                else {
                    var results = JSON.parse(body)
                    if (results.currentlyTracked == true) {

                        //Format of data retrieved from CMX
                        mapData.mapImage = {} //To store map image data
                        mapData.mapImage.x = results.mapInfo.image.width //width (x) of the returned map image in pixels
                        mapData.mapImage.y = results.mapInfo.image.height //height (y) of the returned map image in pixels
                        mapData.mapImage.filename = results.mapInfo.image.imageName //Store filename of map image
                        mapData.mapSize = {} //Store map metadata
                        mapData.mapSize.x = results.mapInfo.floorDimension.width    //width (x) of the returned map image in Units (as determined by map)
                        mapData.mapSize.y = results.mapInfo.floorDimension.length   //length (y) of the returned map image in Units (as determined by map)  Note: its counter-intuitive that length may be the shorter dimension depending on map orientation) however cartographers maintain this standard where width = x & length = y axis, as maps may be oriented many different directions
                        mapData.location = {}  //User location 
                        mapData.location.x = results.mapCoordinate.x    //returned x coordinate of our user in Units (as determined by map)
                        mapData.location.y = results.mapCoordinate.y    //returned y coordinate of our user in Units (as determined by map)
                        mapData.location.units = results.mapCoordinate.unit //store units of length map is measured in
                        mapData.location.mapHierarchy = results.mapInfo.mapHierarchyString //the Campus>Building>Floor hierarchy of the current user
                        mapData.position = {} //User position in pixels - calculated below.  Note you could calculate this directly from the response values but all the values are shown above to help understand what each value is for
                        mapData.position.x = (mapData.mapImage.x/mapData.mapSize.x)*mapData.location.x  //x pixel of the map image where the user is located  (Find pixels/unit ratio, and then multiply times number of x units)
                        mapData.position.y = (mapData.mapImage.y/mapData.mapSize.y)*mapData.location.y  //y pixel of the map image where the user is located  (Find pixels/unit ratio, and then multiply times number of y units)
                        
                        //Data mapped - return promise
                        resolve();

                    }
                    else {
                        reject('Client is not currently tracked - please confirm they are active on the wireless network, and that the macAddress is correct.');
                    }
                }
            }
        });
        

    })
}


function getMap() {
    console.log('Getting map for '+mapData.location.mapHierarchy)
    return new Promise(function(resolve, reject) {
        var options = { method: 'GET',
          url: baseCMXUrl + '/api/config/v1/maps/imagesource/' + mapData.mapImage.filename,
          auth: {
            'user': CMXusername,
            'pass': CMXpassword
          },
          encoding: null //pass request as buffer
        }

        request(options, function (error, response, body) {
            if (error) {
                console.error('Error in making request to CMX')
                reject();
            }

            else {

                if(response.statusCode != 200) {
                    reject('Error in making request to CMX.  HTTP Response code is: '+response.statusCode)
                }
                else {
                    //Body now contains image of our floorplan - could write to file or as we do here, can pass buffer to next promise
                    resolve(body)
                }
            }
        })


    })
}

function generateComposite(mapBuffer) {
    console.log(`Compositing map of location for (${mapData.position.x},${mapData.position.y})`)
    return new Promise(function(resolve, reject) {
        Jimp.read(mapBuffer, function (err, map) {
            if (err) throw err;
            Jimp.read(indicatorImage, function(err, indicator){
                

                
                //get dimensions of indicator icon
                var ind_w = indicator.bitmap.width; // the width of the image
                var ind_h = indicator.bitmap.height; // the height of the image
                //calculate aspect ratio of icon for resizing
                ind_ratio = ind_w/ind_h

                //calculate new height as 10% of map height
                new_ind_h = mapData.mapImage.y*.1
                //calculate new width from original aspect ratio
                new_ind_w = ind_ratio*new_ind_h
                //resize indicator image with new dimensions
                indicator.resize(new_ind_h, new_ind_w) //resize indicator to be appropriately sized for the map (10% of the height calculated above with width to keep aspect)

                //Jimp image library needs the upper left corner of where to paste the icon image.  The coordinates we have are exactly where we want the point of our indicator.
                //Since Jimp wants the left (upper) corner, we subtract half the width of the image to center the point of our indicator
                new_pix_x = mapData.position.x - (new_ind_w/2)
                //Since PIL needs the upper (left) corner, we subtract the height of the icon image to move the indicator point to the bottom.
                new_pix_y = mapData.position.y - new_ind_h

                //Composite indicator onto map at x,y coordinates
                map.composite(indicator,new_pix_x,new_pix_y).write('./images/composite.jpg', function(err, result){
                    if(!err) {
                        console.log('Location composited on map successfully.  Image output to ./images/composite.jpg')
                        resolve();
                    }
                }) 

            })
        });
    });
}


//Promise Control

getLocationData()
.then(getMap)
.then(generateComposite)
.catch(function(err){
    console.error(err)
})