from selenium_utils import get_chrome_driver, get_wired_driver, get_wired_driver_gecko


# * Module Code
URL = "https://secure.toronto.ca/webapps/parking/"

# USE_PROXY = False to RUN WITHOUT PROXY. USE_PROXY = True to RUN WITH PROXY.
USE_PROXY = False

def get_toronto_parking_driver(useChrome=True, preloadURL = True):
	driver = None
	
	if useChrome:
		driver = get_wired_driver(useProxy=USE_PROXY)
	else:
		driver = get_wired_driver_gecko(useProxy=USE_PROXY)

	if preloadURL:
		driver.get(URL)

	return driver

def get_toronto_parking_chrome_driver():
	driver = get_chrome_driver(imagesShouldNotLoad=False, useProxy=USE_PROXY, useUserAgent=False)
	driver.get(URL)

	return driver