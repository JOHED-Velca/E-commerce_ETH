import time
from selenium.webdriver.common.by import By
from aws_helpers import get_s3_bucket
from log_utils import get_modules_logger
from selenium_utils import get_elements, get_one_element
import traceback
import uuid
import io


logger = get_modules_logger(__name__)
s3 = get_s3_bucket()


def toronto_parking_load_error(driver):
	retries = 0

	while retries < 5:
		try:
			errorNode = get_one_element(1, "//div[contains(text(),'Error:')]", driver)
			return errorNode
		except:
			pass
		retries += 1
	
	return False


def toronto_parking_agree_with_terms(driver):
	acceptTerms = get_elements(4, "//button[@id='cot-terms-agree']", driver)
	acceptTerms[0].click()
	return True


def toronto_parking_fill_info(driver, ticket:str, plate:str):
	lookup_elem = get_one_element(3, "//input[@id='lookupvialp']", driver)
	lookup_elem.click()

	tagNumberInp = get_one_element(1, "//input[@id='ticketnumB']", driver)
	tagNumberInp.clear()
	tagNumberInp.send_keys(ticket)

	licensePlate = get_one_element(1, "//input[@id='licenseplate']", driver)
	licensePlate.clear()
	licensePlate.send_keys(plate)
	return True


def toronto_parking_submit_info(driver):
	submitBtn = get_one_element(2, "//button[@id='singlebutton']", driver)
	submitBtn.click()
	return True


def toronto_parking_extract_info(driver):
	try:
		detailsTable = get_one_element(2, "//table[@id='parkingtickets']", driver)
		outerInformation = dict()
		innerInformation = dict()
		tableRow = detailsTable.find_element(By.XPATH, "//td[contains(@class, 'tixamount')]/parent::tr")
		tableElements = tableRow.find_elements(By.XPATH, "./td")
		linkTag = None
		for elem in tableElements:
				if elem.get_attribute("class") == "tixno":
						outerInformation.update({"number": elem.text})
						linkTag = elem.find_element(By.XPATH, "./a")
				if elem.get_attribute("class") == "tixstatus":
						outerInformation.update({"status": elem.text})
				if elem.get_attribute("class") == "tixdate":
						outerInformation.update({"date": elem.text})
				if elem.get_attribute("class") == "tixamount":
						amt = elem.text
						outerInformation.update({"amount": str(amt.replace("$", ""))})
				if elem.get_attribute("class") == "tixaction":
						outerInformation.update({"action": elem.text})
		completeHTML = detailsTable.get_attribute("outerHTML")
		outerInformation.update({"completeHTML": completeHTML})
		if linkTag:
				linkTag.click()
				iViolationNoticeNumber = get_one_element(
						0,
						"//div[contains(text(), 'Violation Notice Number')]/following-sibling::div[@class='ticketno']",
						driver,
				)
				iInfractionDateTime = get_one_element(
						0,
						"//div[contains(text(), 'Infraction Date-Time')]/following-sibling::div[@class='tciketdate']",
						driver,
				)
				iViolationNoticeStatus = get_one_element(
						0,
						"//div[contains(text(), 'Violation Notice Status')]/following-sibling::div[@class='ticketstatus']",
						driver,
				)
				iPlateNumber = get_one_element(
						0,
						"//div[contains(text(), 'Plate Number')]/following-sibling::div[@class='ticketplate']",
						driver,
				)
				iCourtDateTime = get_elements(
						0,
						"//div[contains(text(), 'Court Date-Time')]/following-sibling::div[@class='trialdate']",
						driver,
				)
				iCourtDateTime = iCourtDateTime[0] if iCourtDateTime else None
				iCourtLocation = get_elements(
						0,
						"//div[contains(text(), 'Court Location')]/following-sibling::div[@class='triallocation']",
						driver,
				)
				iCourtLocation = iCourtLocation[0] if iCourtLocation else None
				if iCourtLocation:
						iCourtLocationLink = iCourtLocation.find_element(
								By.XPATH, "./a[@href]"
						).get_attribute("href")
				else:
						iCourtLocationLink = None
				# iCourtLocationLink = iCourtLocation.get_attribute("href")
				iInfractionLocation = get_one_element(
						0,
						"//div[contains(text(), 'Infraction Location')]/following-sibling::div[@class='ticketlocation']",
						driver,
				)
				iInfractionDescription = get_one_element(
						0,
						"//div[contains(text(), 'Infraction Description')]/following-sibling::div[@class='ticketdescription']",
						driver,
				)
				iSetFineAmount = get_one_element(
						0, "//div[@class='row cost']//div[@class='ticketamount']", driver
				)
				iAdditionalCost = get_one_element(
						0,
						"//div[@class='row additionalcost']//div[@class='additionalcharge']",
						driver,
				)
				iTotal = get_one_element(
						0, "//div[@class='row amountdue']//div[@class='amountdue']", driver
				)
				iAmountDue = get_one_element(
						0, "//div[@class='row totalcost']//div[@class='totalcharge']", driver
				)
				iDueDate = get_elements(0, "//p[@class='paymentduedate']", driver)
				iDueDate = iDueDate[0].text if iDueDate else None
				if iDueDate:
						iDueDate = iDueDate.lstrip("Payment Due Date: ")
				completeHTML = get_one_element(
						0, "//div[@class='ticketdetail']", driver
				).get_attribute("outerHTML")
				# Take screenshot and upload to S3 bucket
				uid = str(uuid.uuid4()).replace("-", "")
				ss = f"{uid}.png"
				with io.BytesIO(driver.get_screenshot_as_png()) as f:
						s3.upload_fileobj(f, "payticketsbot", ss)
				iSetFineAmount = iSetFineAmount.text
				iAdditionalCost = iAdditionalCost.text
				iTotal = iTotal.text
				iAmountDue = iAmountDue.text
				data = {
						"number": iViolationNoticeNumber.text,
						"infractionDateTime": iInfractionDateTime.text,
						"violationNotice": iViolationNoticeStatus.text,
						"plate": iPlateNumber.text,
						"courtDateTime": iCourtDateTime.text if iCourtDateTime else None,
						"courtLocation": iCourtLocation.text if iCourtLocation else None,
						"courtLocationLink": iCourtLocationLink,
						"infractionLocation": iInfractionLocation.text,
						"infractionDesc": iInfractionDescription.text,
						"amount": str(iSetFineAmount.replace("$", "")),
						"additionalCost": str(iAdditionalCost.replace("$", "")),
						"total": str(iTotal.replace("$", "")),
						"amountDue": str(iAmountDue.replace("$", "")),
						"dueDate": iDueDate,
						"completeHTML": completeHTML,
						"screenshot": ss,
				}
				innerInformation.update(data)
		res = {
				"outerInformation": outerInformation,
				"innerInformation": innerInformation,
		}
		return res
	except Exception as e:
		logger.exception(f"Pay Parking Tickets Grab Details Error - {traceback.format_exc()}")
		return None


def toronto_parking_get_ticket_amount(driver, violation_num: str, plate_num: str, maxAttempts = 3):
	attempts = 0

	driver.get("https://secure.toronto.ca/webapps/parking/")
	driver.set_page_load_timeout(30)

	while attempts < maxAttempts:
		try:
			completedStep = toronto_parking_agree_with_terms(driver)
			completedStep = toronto_parking_fill_info(driver, ticket=violation_num, plate=plate_num)
			completedStep = toronto_parking_submit_info(driver)
			# Validation Step: Check if ticket information table is found
			ticket_info_table = toronto_parking_extract_info(driver)

			if ticket_info_table:
				return ticket_info_table
		except:
			pass

		if toronto_parking_load_error(driver):
			return None
		
		try:
			ERROR_CODE = "format XXXXXXXX."
			errorBoxNode = get_one_element(0, f'//small[contains(text(), "{ERROR_CODE}")]', driver)
			comment_text = errorBoxNode.get_attribute('innerHTML')
			return comment_text
		except:
			pass
		
		try:
			ERROR_CODE = "You must provide a valid tag/ticket number."
			errorBoxNode = get_one_element(0, f"//p[contains(text(), '{ERROR_CODE}')]", driver)
			return ERROR_CODE
		except:
			pass
		
		try:
			ERROR_CODE = "tag number must be."
			ticketInvalid = get_one_element(0, f"//div[contains(@class, 'form-group) and contains(@class, 'has-error)]/small[contains(text(), '{ERROR_CODE}')]", driver)

			comment_text = ticketInvalid.get_attribute('innerHTML')
			print(f"[TICKET {violation_num}]: {comment_text}")
			return ERROR_CODE
		except:
			pass


		attempts += 1							
		continue
  
	return None

