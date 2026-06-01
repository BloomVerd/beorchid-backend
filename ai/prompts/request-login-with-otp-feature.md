# Request Login with OTP feature

## Add an otp_code and otp_code_expires_at fields for Farmer typeorm resource inside the file with url: **src/farmer/farmer.resource.ts**

## Add requestLoginWithOTP service inside the file with url: **src/farmer/auth/auth.service.ts**. 
* This takes an email for the user
* Updates the otp_code and otp_code_expires_at for user with the email and saves it for that user.
* Sends an email (just add a comment for that line, I will add the implementation later)

## Update the requestLoginWithOTP mutation inside the file with url: **src/farmer/auth.resolver.ts** to make use of the service.

## Add a service for loginWithOTP inside file with url: **src/farmer/auth.service.ts** which takes an email, and otpCode fields.
* The service finds the farmer with email, confirms if the otpCode is accurate and the otp_code_expires_at has not bypass 15 minutes.
* If match, clear the otp_code and otp_code_expires_at fields

## Update auth.resolver.ts file for loginWithOTP to use the service

## Let update the template file for sending-otp-login-code using out theme, here is the url: **src/farmer/templates/send-otp-login-code.hbs**

## Write test for the services created inside the file with url **src/farmer/auth/auth.service.spec.ts**
