import requests
import re
from fake_useragent import UserAgent

# ENVIRONMENT VARIABLES
R_SITEKEY="6LeN_XIUAAAAAEd8X21vFtkJ3_c7uA0xpUGcrGpe"
R_WEBSITE="https://www.google.com/recaptcha/api2/anchor?ar=1&k=6LeN_XIUAAAAAEd8X21vFtkJ3_c7uA0xpUGcrGpe&co=aHR0cHM6Ly9zZWN1cmUudG9yb250by5jYTo0NDM.&hl=en&v=GUGrl5YkSwqiWrzO3ShIKDlu&size=invisible&cb=knjj03ky913t"

class ReCaptchaV3Bypass:
    """
    Bypass the reCAPTCHA v3 challenge.
    Only works for some reCAPTCHA v3 challenges.
    """
    def __init__(self, target_url) -> None:
        self.target_url = target_url
        self.session = requests.Session()

    def extract_values(self, response) -> tuple[str, str, str, str]:
        try:
            recaptcha_token = self._extract_value(
                r"type=\"hidden\" id=\"recaptcha-token\" value=\"(.*?)\"", response.text
            )
            try:
                k_value = self._extract_value(r"&k=(.*?)&co", self.target_url)
                co_value = self._extract_value(r"&co=(.*?)&hl", self.target_url)
                v_value = self._extract_value(r"&v=(.*?)&size", self.target_url)
            except:
                pass
        except AttributeError:
            print("Failed to extract values. Check your regex patterns.")
            return None, None, None, None

        return recaptcha_token, k_value, co_value, v_value

    def _extract_value(self, pattern, text) -> str:
        return re.search(pattern, text).group(1)

    def get_response(self) -> requests.Response:
        try:
            return self.session.get(self.target_url)
        except requests.exceptions.RequestException as e:
            print(f"Failed to send GET request: {e}")
            return None

    def post_response(self, recaptcha_token, k_value, co_value, v_value) -> requests.Response:
        post_url = "https://www.google.com/recaptcha/api2/reload?k=" + k_value
        post_data = self._generate_post_data(recaptcha_token, k_value, co_value, v_value)
        try:
            return self.session.post(post_url, data=post_data)
        except requests.exceptions.RequestException as e:
            print(f"Failed to send POST request: {e}")
            return None

    def _generate_post_data(self, recaptcha_token, k_value, co_value, v_value) -> dict:
        return {
            "v": v_value,
            "reason": "q",
            "c": recaptcha_token,
            "k": k_value,
            "co": co_value,
            "hl": "en",
            "size": "invisible",
            "chr": "%5B89%2C64%2C27%5D",
            "vh": "13599012192",
        }

    def extract_gtk(self, response) -> str:
        try:
            return self._extract_value(r'\["rresp","(.*?)"', response.text)
        except AttributeError:
            print("Failed to extract GTK. Check your regex pattern.")
            return None

    def bypass(self) -> str:
        initial_response = self.get_response()
        if initial_response is None:
            return None
        recaptcha_token, k_value, co_value, v_value = self.extract_values(initial_response)
        if None in (recaptcha_token, k_value, co_value, v_value):
            return None
        post_response = self.post_response(recaptcha_token, k_value, co_value, v_value)
        if post_response is None:
            return None
        return self.extract_gtk(post_response)

def getParkingAPIData(plate: str, ticket: str):
    url = "https://api.toronto.ca/parking/Lookup"
    ua = get_random_user_agent()
    
    # Initialize ReCaptcha bypass
    captcha_bypass = ReCaptchaV3Bypass(R_WEBSITE)
    g_response = captcha_bypass.bypass()

    if not g_response:
        print("Failed to bypass reCAPTCHA")
        return None

    headers = {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "g-recaptcha-response": g_response,
        "Origin": "https://secure.toronto.ca",
        "Referer": "https://secure.toronto.ca/",
    }
    
    response = requests.post(
        url,
        json={
            "PLATE_NUMBER": plate.upper(),
            "TICKET": ticket.upper(),
        },
        headers=headers,
    )
    print(response)

    return response

def getParkingTicketData(plate: str, ticket: str):
    response = getParkingAPIData(plate=plate, ticket=ticket)

    if not response or not response.ok:
        return None

    print(
        f"Parking Ticket Request --->>> Plate: {plate} | Violation: {ticket} | Status: {response.status_code} {response.reason}")

    ticketData = response.json()
    validate = ticketData.get('validateResponse')

    if validate:
        if validate.get('status') == 'FAILURE':
            return validate

    related_account = ticketData["ServiceAccount"][0]["RelatedAccount"][0]
    financial_doc = related_account["FinancialDocument"][0]

    outerInformation = dict()
    innerInformation = dict()

    # Default value.
    outerInformation["action"] = "N/A"

    for v in related_account['Attribute']:
        if v['Key'] == "SCREENING_FLAG" or v['Key'] == "HEARING_FLAG" and v["body"] == 'Y':
            outerInformation["action"] = "Dispute this violation notice"

    # Extract information from Raw API Data and store in outerDataDict
    outerInformation["number"] = ticketData["ServiceAccount"][0]["AccountNumber"]
    outerInformation["status"] = financial_doc["PaymentStatus"]
    outerInformation["date"] = financial_doc["KeyDate"][0]["body"]
    outerInformation["amount"] = financial_doc["TotalAmount"].replace("$", "")
    outerInformation["completeHTML"] = "N/A"

    # Extract information from the first RelatedAccount dictionary
    iViolationNoticeNumber = related_account["ID"][0]["body"]
    innerInformation.update({"number": iViolationNoticeNumber})
    iInfractionDateTime = related_account["FinancialDocument"][0]["KeyDate"][0]["body"]
    innerInformation.update({"infractionDateTime": iInfractionDateTime})
    iViolationNoticeStatus = related_account["Status"]["body"]
    innerInformation.update({"violationNotice": iViolationNoticeStatus})
    iPlateNumber = related_account["Attribute"][0]["body"]
    innerInformation.update({"plate": iPlateNumber})

    # Extract information from the FinancialDocument dictionary
    iSetFineAmount = financial_doc["AmountLineItem"][0]["body"].replace(
        "$", "")
    innerInformation.update({"amount": iSetFineAmount})
    iAdditionalCost = financial_doc["AmountLineItem"][1]["body"].replace(
        "$", "")
    innerInformation.update({"additionalCost": iAdditionalCost})
    iTotal = financial_doc["AmountLineItem"][2]["body"].replace("$", "")
    innerInformation.update({"total": iTotal})
    iAmountDue = financial_doc["AmountLineItem"][2]["body"].replace("$", "")
    innerInformation.update({"amountDue": iAmountDue})
    iDueDate = financial_doc["KeyDate"][0]["body"]
    innerInformation.update({"dueDate": iDueDate})

    iInfractionLocation = related_account["AccountParty"][0]["Address"][0]["StreetName"]
    innerInformation.update({"infractionLocation": iInfractionLocation})
    iInfractionDesc = related_account["AccountParty"][0]["Address"][0]["AdditionalDescription"]
    innerInformation.update({"infractionDesc": iInfractionDesc})

    # Later set Court Information from API response.
    innerInformation.update({"courtDateTime": 'N/A'})
    innerInformation.update({"courtLocation": 'N/A'})
    innerInformation.update({"courtLocationLink": 'N/A'})

    res = {"outerInformation": outerInformation,
           "innerInformation": innerInformation}

    return res

def get_random_user_agent():
    ua = UserAgent()
    return ua.random

if __name__ == "__main__":
    plate = "czcl340"
    ticket = "PM451052"
    result = getParkingTicketData(plate, ticket)
    print(result)