import os
import requests
import json
import sys
from PIL import Image
from io import BytesIO



#Variables
baseCMXUrl = os.getenv('CMXHost', 'https://cmxlocationsandbox.cisco.com')
macAddress = os.getenv('macAddress', '00:00:2a:01:00:27')
CMXusername = os.getenv('CMXusername', 'learning')
CMXpassword = os.getenv('CMXpassword', 'learning')

#Read image
indicatorImage = Image.open( '../images/green-indicator.png' )

# Dict to store all our dimensions
mapData = {}

print 'Getting location data for '+macAddress

url = baseCMXUrl + "/api/location/v1/clients/" + macAddress

headers = {'authorization': 'Basic bGVhcm5pbmc6bGVhcm5pbmc='}

response = requests.request("GET", url, auth=(CMXusername,CMXpassword))

if response.status_code != 200:
    print 'Error in making request to CMX.  HTTP Response code is: '+str(response.status_code)
    sys.exit()
else:
    if response.json()['currentlyTracked']:       

        # 
        # Storage of data retrieved from CMX
        # 

        #width (x) of the returned map image in pixels
        mapData['mapImage.x'] = response.json()['mapInfo']['image']['width']
        #height (y) of the returned map image in pixels
        mapData['mapImage.y'] = response.json()['mapInfo']['image']['height']
        #Store filename of map image
        mapData['mapImage.filename'] = response.json()['mapInfo']['image']['imageName']

        #width (x) of the returned map image in Units (as determined by map)
        mapData['mapSize.x'] = response.json()['mapInfo']['floorDimension']['width']
        #length (y) of the returned map image in Units (as determined by map)  Note: its counter-intuitive that length may be the shorter dimension depending on map orientation) however cartographers maintain this standard where width = x & length = y axis, as maps may be oriented many different directions
        mapData['mapSize.y'] = response.json()['mapInfo']['floorDimension']['length']

        #returned x coordinate of our user in Units (as determined by map)
        mapData['location.x'] = response.json()['mapCoordinate']['x']
        #returned y coordinate of our user in Units (as determined by map)
        mapData['location.y'] = response.json()['mapCoordinate']['y']
        #store units of length map is measured in
        mapData['location.units'] = response.json()['mapCoordinate']['unit']
        #the Campus>Building>Floor hierarchy of the current user
        mapData['location.mapHierarchy'] = response.json()['mapInfo']['mapHierarchyString']

        #x pixel of the map image where the user is located  (Find pixels/unit ratio, and then multiply times number of x units)
        mapData['position.x'] = (mapData['mapImage.x']/mapData['mapSize.x'])*mapData['location.x']
        #y pixel of the map image where the user is located  (Find pixels/unit ratio, and then multiply times number of y units)
        mapData['position.y'] = (mapData['mapImage.y']/mapData['mapSize.y'])*mapData['location.y']

    else:
        print 'Client is not currently tracked - please confirm they are active on the wireless network, and that the macAddress is correct.'

print 'Getting map for '+ mapData['location.mapHierarchy']

url = baseCMXUrl + '/api/config/v1/maps/imagesource/' + mapData['mapImage.filename']
response = requests.request("GET", url, auth=(CMXusername,CMXpassword))

if response.status_code != 200:
    print 'Error getting map image.  HTTP Response code is: '+str(response.status_code)
    sys.exit()

else:
    #Open returned map image in PIL
    mapImage = Image.open(BytesIO(response.content))
    
    #get dimensions of indicator icon
    ind_w,ind_h = indicatorImage.size
    #calculate aspect ratio of icon for resizing
    ind_ratio = ind_w/ind_h
    #calculate new height as 10% of map height
    new_ind_h = mapData['mapImage.y']*.1
    #calculate new width from original aspect ratio
    new_ind_w = ind_ratio*new_ind_h
    #resize indicator image with new dimensions
    indicatorImage = indicatorImage.resize((int(new_ind_w),int(new_ind_h)))


    #PIL needs the upper left corner of where to paste the icon image.  The coordinates we have are exactly where we want the poitn of our indicator.
    #Since PIL wants the left (upper) corner, we subtract half the width of the image to center the point of our indicator
    new_pix_x = mapData['position.x'] - (new_ind_w/2)
    #Since PIL needs the upper (left) corner, we subtract the height of the icon image to move the indicator point to the bottom.
    new_pix_y = mapData['position.y'] - (new_ind_h)

    #Paste the indicator image onto the map with the top left corner of the indicator at the pixels we calculated.
    #The third parameter is a "mask" to allow PNG transparency

    print 'Compositing map of location for ('+str(mapData['position.x'])+','+str(mapData['position.y'])+')'

    mapImage.paste(indicatorImage,(int(new_pix_x),int(new_pix_y)),indicatorImage)

    print 'Location composited on map successfully.  Image output to ../images/composite.jpg'
    
    mapImage.save('../images/composite.jpg',quality=90)