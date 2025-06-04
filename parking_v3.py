from datetime import datetime
from selenium import webdriver
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.webdriver import WebDriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By


def find_element(driver: WebDriver, timeout_seconds: int, xpath: str):
	return WebDriverWait(driver, timeout_seconds).until(EC.element_to_be_clickable((By.XPATH, xpath)))


def find_parking_ticket_amount_v3(driver: WebDriver | None, ticket: str, plate: str):
	try:
		data = {}

		if driver == None:
			options = Options()
			service = Service(ChromeDriverManager().install())
			driver = webdriver.Chrome(service=service, options=options)

		driver.get('https://pay.toronto.ca/service/toronto_courts/workflow/mytorontopay_parkingviolations_findandpay/1')
		driver.set_page_load_timeout(30)

		button = find_element(driver, 15, "//button[span[text()='Agree and Continue']]")
		button.click()
		button = find_element(driver, 15, '//button[div[contains(text(),"Violation Number")]]')
		button.click()

		violation_notice_input = find_element(driver, 15, '//input[@name="violation-number"]')
		violation_notice_input.clear()
		violation_notice_input.send_keys(ticket)

		licence_plate_input = find_element(driver, 5, '//input[@name="licence-plate-number"]')
		licence_plate_input.clear()
		licence_plate_input.send_keys(plate)

		search_button_xpath = '//button[@type="submit" and contains(text(), "Search")]'
		search_button = find_element(driver, 5, search_button_xpath)
		search_button.click()

		# Your parking violation must be paid at a ServiceOntario office before you renew your licence plate.
		try:
			specific_error_elements = find_element(driver, 10, '//div[contains(text(),"Your parking violation must be paid at a ServiceOntario office")]')
			
			if specific_error_elements:
				specific_error_message = "Only Payable in Person at Service Ontario"
				errorResponse = {'status': 'FAILURE', 'ticket': ticket, 'plate': plate, 'errorMessage': specific_error_message, 'errorCode': 'poso'}
				print(errorResponse)
				return errorResponse
		except:
			pass

		# Open Popup Table
		search_button = find_element(driver, 5, '//div[contains(text(),"$")]')
		search_button.click()     

		descriptions = ["Amount Due", "Violation Notice Number", "Violation Date", "Plate Number",
						"Violation Notice Status", "Violation Location", "Description", "Due Date",
						"Penalty Amount", "Additional Costs", "Amount Due"]

		for desc in descriptions:
			dt_element = find_element(driver, 15, f'//dt[contains(text(),"{desc}")]')
			dd_element = dt_element.find_element(By.XPATH, './following-sibling::dd')
			data[desc] = dd_element.text

		# Convert to Server Date
		date_format = "%Y %B %d"  # Este es el formato que leemos de la cadena HTML
		old_date_format = "%Y-%m-%d"  # Este es el formato del servidor

		# Read new date format and convert to Server Date
		for key in ["Violation Date", "Due Date"]:
			date_object = datetime.strptime(data[key], date_format)
			data[key] = date_object.strftime(old_date_format)

		# Remove Dolar Sign
		for key in ["Penalty Amount", "Additional Costs", "Amount Due"]:
			data[key] = data[key].replace("$", "").strip()

		innerInformation = {}
		outerInformation = {}

		innerInformation = {
			"number": data["Violation Notice Number"],
			"infractionDateTime": data["Violation Date"],
			"violationNotice": data["Violation Notice Status"],
			"plate": data["Plate Number"],
			"courtDateTime": None,
			"courtLocation": None,
			"courtLocationLink": None,
			"infractionLocation": data["Violation Location"],
			"infractionDesc": data["Description"],
			"amount": data["Penalty Amount"],
			"additionalCost": data["Additional Costs"],
			"total": data["Amount Due"],
			"amountDue": data["Amount Due"],
			"dueDate": data["Due Date"],
			"completeHTML": None,
		}

		outerInformation = {
			"number": data["Violation Notice Number"],
			"status": data["Violation Notice Status"],
			"date": data["Violation Date"],
			"amount": data["Penalty Amount"],
			"action": None,
		}

		res = {
			"outerInformation": outerInformation,
			"innerInformation": innerInformation,
		}

		return res
	except Exception as e:
		print(f"Error processing: {e}")
		return None
