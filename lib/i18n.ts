// Interface text in English, Hindi and Marathi. English is the source of truth.
//
// TypeScript checks that Hindi and Marathi have EVERY key English has (and no
// extras), so a missing translation stops the build instead of reaching a user.
// To add a language: add it to LANGUAGES (lib/language.ts) and add one more
// dictionary below.
//
// IMPORTANT: the Hindi and Marathi wording was drafted for this project and has
// NOT yet been reviewed by native speakers. Have it checked, especially the two
// consent texts, before real contractors or developers rely on it.
//
// Values that the rest of the app depends on (trade names, locality spellings,
// availability codes, consent wording and versions) are NOT changed by the
// language: only the label shown to the person is translated.
import type { LanguageCode } from "./language";

const EN = {
  common: {
    back: "← Back to home",
    brand: "Contractor Desk for Pune Developers",
    languageLabel: "Language",
    languageHelp: "Choose the language for this form and for the messages we send you",
    optional: "(optional)",
    fixOne: "Please fix 1 problem below.",
    fixMany: "Please fix {n} problems below.",
    consentRecordedLabel: "The English wording that is recorded with your consent:",
  },
  trades: {
    Masonry: "Masonry",
    Electrical: "Electrical",
    Plumbing: "Plumbing",
    Painting: "Painting",
    Carpentry: "Carpentry",
    Other: "Other",
  },
  areas: {
    Baner: "Baner",
    Hinjawadi: "Hinjawadi",
    Wakad: "Wakad",
    Kharadi: "Kharadi",
    Hadapsar: "Hadapsar",
    Kothrud: "Kothrud",
    Other: "Other (enter another Pune locality)",
  },
  availability: {
    now: "Available now",
    from_date: "Available from a specific date",
    unavailable: "Currently unavailable",
  },
  register: {
    title: "Contractor registration",
    intro: "Tell us your trade and where you work in Pune. This takes about a minute.",
    noteTitle: "How your details are used.",
    noteBody:
      "Your mobile number is stored privately and is not shown publicly. It may be shared with relevant developers for work opportunities, as described in the consent box below. Being registered does not mean you are verified or guaranteed any work. To ask for deletion, contact the person who shared this form with you.",
    nameLabel: "Contractor name",
    namePlaceholder: "e.g. Ramesh Patil",
    tradeLabel: "Primary trade",
    tradePlaceholder: "Select your trade",
    areaLabel: "Service area",
    areaPlaceholder: "Select an area in Pune",
    otherAreaLabel: "Other Pune locality",
    otherAreaPlaceholder: "e.g. Wagholi",
    availabilityLabel: "Availability",
    availableFrom: "Available from",
    phoneLabel: "Mobile number",
    phonePlaceholder: "e.g. 98765 43210 or +91 98765 43210",
    phoneHint: "10-digit Indian mobile number. +91 is optional.",
    submit: "Register",
    submitting: "Submitting…",
    success: "Thank you. Your registration has been received and stored privately.",
    testMode: "Test mode: this was saved as a TEST record, not a real registration.",
    failed: "Sorry, we could not save your registration. Nothing was saved. Please try again later.",
  },
  request: {
    title: "Tell us about the disruption",
    intro:
      "Describe in your own words what happened and what you need, then fill in the details. You check everything before anything is saved.",
    noteTitle: "Before you start.",
    noteBody:
      "Real requests are not sent to any AI service: you enter the details yourself. (Google's Gemini AI is used only for our own tests with made-up text.) Please do not include personal details in the description. Saving a request does not contact or match any contractor.",
    descriptionLabel: "What happened, and what do you need?",
    descriptionPlaceholder:
      "e.g. Our plumbing contractor at the Baner site left halfway through. We need a replacement plumber from next Monday for about two weeks.",
    charCount: "{n}/{max} characters",
    continue: "Continue",
    pleaseWait: "Please wait…",
    editAgain: "Edit description and start again",
    noticeManual: "Please fill in the details below yourself. Your description was not sent to any AI service.",
    noticeReadFailed:
      "We could not read your description automatically. Please fill in the details below yourself.",
    noticeAi:
      "Synthetic test mode: these details were read automatically and may be wrong. Please check every field before saving.",
    moreDetail: "We need a little more detail:",
    tradeLabel: "Trade needed",
    tradePlaceholder: "Select a trade",
    areaLabel: "Site locality in Pune",
    areaPlaceholder: "e.g. Baner",
    startLabel: "Needed from",
    durationLabel: "Expected duration in days",
    durationPlaceholder: "e.g. 14",
    notesLabel: "Other notes",
    nameLabel: "Your name or company",
    phoneLabel: "Your mobile number",
    phonePlaceholder: "e.g. 98765 43210 or +91 98765 43210",
    phoneHint: "Kept in our private records. It is not sent to any AI service.",
    save: "Save request",
    saving: "Saving…",
    saved:
      "Thank you. Your request has been received and stored privately. No contractor has been contacted or matched yet.",
    testMode: "Test mode: this was saved as a TEST record, not a real request.",
    another: "Submit another request",
    failedSave: "Sorry, we could not save your request. Nothing was saved. Please try again later.",
    translationPending:
      "Your original text was saved exactly as you wrote it. An English version for our team is still pending.",
    translationFailed:
      "Your original text was saved exactly as you wrote it. An English translation is not available right now.",
  },
  consent: {
    contractor:
      "I agree that my contact details will be stored privately and may be shared with relevant developers for contractor work opportunities. I understand that I can request deletion of my details.",
    request:
      "I agree that the details I enter will be stored privately and used to look for contractors for this requirement, and that I may be contacted about this requirement. My details are not sent to any AI service. I understand that I can request deletion of my details.",
  },
  validation: {
    nameTooLong: "Name must be 80 characters or fewer.",
    chooseTrade: "Please choose your primary trade.",
    chooseArea: "Please choose your service area.",
    enterOtherArea: "Please enter the Pune locality you serve.",
    otherAreaTooLong: "Locality must be 60 characters or fewer.",
    otherAreaChars: "Use letters, numbers and basic punctuation only.",
    areaFromList: "Please choose a service area from the list.",
    chooseAvailability: "Please tell us your availability.",
    chooseAvailableDate: "Please choose the date you become available.",
    validDate: "Please enter a valid date.",
    datePast: "The date cannot be in the past.",
    enterPhone: "Please enter your mobile number.",
    phoneFormat: "Enter a 10-digit Indian mobile number starting with 6-9, with optional +91.",
    consentRegister: "Consent is required to register.",
    descriptionShort: "Please describe the situation in at least {min} characters.",
    descriptionLong: "Please keep the description under {max} characters.",
    descriptionRange: "Please describe the situation in {min} to {max} characters.",
    enterPhoneRequest: "Please enter a mobile number we can reach you on.",
    chooseTradeRequest: "Please choose the trade you need.",
    enterSiteArea: "Please enter the Pune locality of the site.",
    siteAreaChars: "Use 2-60 letters, numbers or basic punctuation.",
    durationRange: "Enter a whole number of days from 1 to {max}.",
    notesTooLong: "Notes must be {max} characters or fewer.",
    consentRequest: "Consent is required to submit a request.",
  },
};

type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };
export type Dict = Widen<typeof EN>;
export type ValidationKey = keyof Dict["validation"];

const HI: Dict = {
  common: {
    back: "← होम पेज पर वापस जाएँ",
    brand: "पुणे के डेवलपर्स के लिए Contractor Desk",
    languageLabel: "भाषा",
    languageHelp: "इस फ़ॉर्म और हमारे भेजे जाने वाले संदेशों के लिए भाषा चुनें",
    optional: "(वैकल्पिक)",
    fixOne: "कृपया नीचे 1 समस्या ठीक करें।",
    fixMany: "कृपया नीचे {n} समस्याएँ ठीक करें।",
    consentRecordedLabel: "आपकी सहमति के साथ दर्ज किया जाने वाला अंग्रेज़ी पाठ:",
  },
  trades: {
    Masonry: "चिनाई / राजमिस्त्री",
    Electrical: "इलेक्ट्रिकल (बिजली का काम)",
    Plumbing: "प्लंबिंग (नल-पाइप का काम)",
    Painting: "पेंटिंग (रंग-रोगन)",
    Carpentry: "बढ़ईगिरी (कारपेंटरी)",
    Other: "अन्य",
  },
  areas: {
    Baner: "बाणेर",
    Hinjawadi: "हिंजवडी",
    Wakad: "वाकड",
    Kharadi: "खराडी",
    Hadapsar: "हडपसर",
    Kothrud: "कोथरूड",
    Other: "अन्य (पुणे का कोई दूसरा इलाका लिखें)",
  },
  availability: {
    now: "अभी उपलब्ध हूँ",
    from_date: "किसी खास तारीख से उपलब्ध हूँ",
    unavailable: "अभी उपलब्ध नहीं हूँ",
  },
  register: {
    title: "ठेकेदार पंजीकरण",
    intro: "हमें अपना काम (ट्रेड) और पुणे में जहाँ आप काम करते हैं, बताइए। इसमें करीब एक मिनट लगता है।",
    noteTitle: "आपकी जानकारी का उपयोग कैसे होता है।",
    noteBody:
      "आपका मोबाइल नंबर निजी तौर पर सुरक्षित रखा जाता है और सार्वजनिक रूप से नहीं दिखाया जाता। नीचे दिए गए सहमति बॉक्स में बताए अनुसार इसे काम के अवसरों के लिए संबंधित डेवलपर्स के साथ साझा किया जा सकता है। पंजीकृत होने का मतलब यह नहीं कि आप सत्यापित हैं या आपको काम की गारंटी है। जानकारी हटवाने के लिए उस व्यक्ति से संपर्क करें जिसने आपको यह फ़ॉर्म दिया।",
    nameLabel: "ठेकेदार का नाम",
    namePlaceholder: "जैसे: रमेश पाटिल",
    tradeLabel: "मुख्य काम (ट्रेड)",
    tradePlaceholder: "अपना काम चुनें",
    areaLabel: "सेवा क्षेत्र",
    areaPlaceholder: "पुणे का कोई इलाका चुनें",
    otherAreaLabel: "पुणे का दूसरा इलाका",
    otherAreaPlaceholder: "जैसे: वाघोली",
    availabilityLabel: "उपलब्धता",
    availableFrom: "इस तारीख से उपलब्ध",
    phoneLabel: "मोबाइल नंबर",
    phonePlaceholder: "जैसे: 98765 43210 या +91 98765 43210",
    phoneHint: "10 अंकों का भारतीय मोबाइल नंबर। +91 लगाना ज़रूरी नहीं है।",
    submit: "पंजीकरण करें",
    submitting: "भेजा जा रहा है…",
    success: "धन्यवाद। आपका पंजीकरण मिल गया है और निजी रूप से सुरक्षित रखा गया है।",
    testMode: "टेस्ट मोड: यह एक TEST रिकॉर्ड के रूप में सहेजा गया है, असली पंजीकरण नहीं।",
    failed: "क्षमा करें, हम आपका पंजीकरण सहेज नहीं सके। कुछ भी सहेजा नहीं गया। कृपया बाद में फिर कोशिश करें।",
  },
  request: {
    title: "काम में आई रुकावट के बारे में बताइए",
    intro:
      "अपने शब्दों में बताइए कि क्या हुआ और आपको क्या चाहिए, फिर विवरण भरें। कुछ भी सहेजने से पहले आप सब कुछ खुद जाँचते हैं।",
    noteTitle: "शुरू करने से पहले।",
    noteBody:
      "असली अनुरोध किसी AI सेवा को नहीं भेजे जाते: विवरण आप खुद भरते हैं। (Google का Gemini AI केवल हमारे अपने परीक्षणों में, काल्पनिक पाठ के साथ उपयोग होता है।) कृपया विवरण में निजी जानकारी न लिखें। अनुरोध सहेजने से किसी ठेकेदार से संपर्क या मिलान नहीं होता।",
    descriptionLabel: "क्या हुआ, और आपको क्या चाहिए?",
    descriptionPlaceholder:
      "जैसे: बाणेर साइट पर हमारा प्लंबिंग ठेकेदार काम अधूरा छोड़कर चला गया। हमें अगले सोमवार से करीब दो हफ़्ते के लिए नया प्लंबर चाहिए।",
    charCount: "{n}/{max} अक्षर",
    continue: "आगे बढ़ें",
    pleaseWait: "कृपया प्रतीक्षा करें…",
    editAgain: "विवरण बदलें और फिर से शुरू करें",
    noticeManual: "कृपया नीचे का विवरण खुद भरें। आपका विवरण किसी AI सेवा को नहीं भेजा गया।",
    noticeReadFailed: "हम आपके विवरण को अपने-आप नहीं पढ़ सके। कृपया नीचे का विवरण खुद भरें।",
    noticeAi:
      "सिंथेटिक टेस्ट मोड: ये विवरण अपने-आप पढ़े गए हैं और गलत हो सकते हैं। सहेजने से पहले हर खाना जाँच लें।",
    moreDetail: "हमें थोड़ी और जानकारी चाहिए:",
    tradeLabel: "कौन सा काम चाहिए",
    tradePlaceholder: "काम चुनें",
    areaLabel: "साइट का इलाका (पुणे में)",
    areaPlaceholder: "जैसे: बाणेर",
    startLabel: "कब से चाहिए",
    durationLabel: "अनुमानित अवधि (दिनों में)",
    durationPlaceholder: "जैसे: 14",
    notesLabel: "अन्य टिप्पणियाँ",
    nameLabel: "आपका नाम या कंपनी",
    phoneLabel: "आपका मोबाइल नंबर",
    phonePlaceholder: "जैसे: 98765 43210 या +91 98765 43210",
    phoneHint: "हमारे निजी रिकॉर्ड में रखा जाता है। यह किसी AI सेवा को नहीं भेजा जाता।",
    save: "अनुरोध सहेजें",
    saving: "सहेजा जा रहा है…",
    saved:
      "धन्यवाद। आपका अनुरोध मिल गया है और निजी रूप से सुरक्षित रखा गया है। अभी तक किसी ठेकेदार से संपर्क या मिलान नहीं हुआ है।",
    testMode: "टेस्ट मोड: यह एक TEST रिकॉर्ड के रूप में सहेजा गया है, असली अनुरोध नहीं।",
    another: "एक और अनुरोध भेजें",
    failedSave: "क्षमा करें, हम आपका अनुरोध सहेज नहीं सके। कुछ भी सहेजा नहीं गया। कृपया बाद में फिर कोशिश करें।",
    translationPending:
      "आपका मूल पाठ जैसा आपने लिखा वैसा ही सहेजा गया है। हमारी टीम के लिए अंग्रेज़ी रूप अभी बाकी है।",
    translationFailed:
      "आपका मूल पाठ जैसा आपने लिखा वैसा ही सहेजा गया है। उसका अंग्रेज़ी अनुवाद अभी उपलब्ध नहीं है।",
  },
  consent: {
    contractor:
      "मैं सहमत हूँ कि मेरी संपर्क जानकारी निजी तौर पर सुरक्षित रखी जाएगी और ठेकेदारी के काम के अवसरों के लिए संबंधित डेवलपर्स के साथ साझा की जा सकती है। मैं समझता/समझती हूँ कि मैं अपनी जानकारी हटवाने का अनुरोध कर सकता/सकती हूँ।",
    request:
      "मैं सहमत हूँ कि मेरे द्वारा दी गई जानकारी निजी तौर पर सुरक्षित रखी जाएगी और इस आवश्यकता के लिए ठेकेदार खोजने में उपयोग की जाएगी, और इस आवश्यकता के बारे में मुझसे संपर्क किया जा सकता है। मेरी जानकारी किसी AI सेवा को नहीं भेजी जाती। मैं समझता/समझती हूँ कि मैं अपनी जानकारी हटवाने का अनुरोध कर सकता/सकती हूँ।",
  },
  validation: {
    nameTooLong: "नाम 80 अक्षरों या उससे कम का होना चाहिए।",
    chooseTrade: "कृपया अपना मुख्य काम (ट्रेड) चुनें।",
    chooseArea: "कृपया अपना सेवा क्षेत्र चुनें।",
    enterOtherArea: "कृपया पुणे का वह इलाका लिखें जहाँ आप काम करते हैं।",
    otherAreaTooLong: "इलाके का नाम 60 अक्षरों या उससे कम का होना चाहिए।",
    otherAreaChars: "केवल अक्षर, अंक और सामान्य विराम-चिह्न इस्तेमाल करें।",
    areaFromList: "कृपया सूची में से सेवा क्षेत्र चुनें।",
    chooseAvailability: "कृपया अपनी उपलब्धता बताएँ।",
    chooseAvailableDate: "कृपया वह तारीख चुनें जिससे आप उपलब्ध होंगे।",
    validDate: "कृपया सही तारीख लिखें।",
    datePast: "तारीख बीती हुई नहीं हो सकती।",
    enterPhone: "कृपया अपना मोबाइल नंबर लिखें।",
    phoneFormat: "6-9 से शुरू होने वाला 10 अंकों का भारतीय मोबाइल नंबर लिखें; +91 वैकल्पिक है।",
    consentRegister: "पंजीकरण के लिए सहमति ज़रूरी है।",
    descriptionShort: "कृपया स्थिति को कम से कम {min} अक्षरों में बताएँ।",
    descriptionLong: "कृपया विवरण {max} अक्षरों से कम रखें।",
    descriptionRange: "कृपया स्थिति को {min} से {max} अक्षरों में बताएँ।",
    enterPhoneRequest: "कृपया ऐसा मोबाइल नंबर लिखें जिस पर हम आपसे संपर्क कर सकें।",
    chooseTradeRequest: "कृपया वह काम (ट्रेड) चुनें जो आपको चाहिए।",
    enterSiteArea: "कृपया साइट का पुणे वाला इलाका लिखें।",
    siteAreaChars: "2-60 अक्षर, अंक या सामान्य विराम-चिह्न इस्तेमाल करें।",
    durationRange: "1 से {max} तक दिनों की पूरी संख्या लिखें।",
    notesTooLong: "टिप्पणियाँ {max} अक्षरों या उससे कम की होनी चाहिए।",
    consentRequest: "अनुरोध भेजने के लिए सहमति ज़रूरी है।",
  },
};

const MR: Dict = {
  common: {
    back: "← मुख्य पृष्ठावर परत जा",
    brand: "पुण्यातील डेव्हलपर्ससाठी Contractor Desk",
    languageLabel: "भाषा",
    languageHelp: "या फॉर्मसाठी आणि आम्ही पाठवणाऱ्या संदेशांसाठी भाषा निवडा",
    optional: "(ऐच्छिक)",
    fixOne: "कृपया खालील 1 चूक दुरुस्त करा.",
    fixMany: "कृपया खालील {n} चुका दुरुस्त करा.",
    consentRecordedLabel: "तुमच्या संमतीसह नोंदवला जाणारा इंग्रजी मजकूर:",
  },
  trades: {
    Masonry: "गवंडीकाम (चिनाई)",
    Electrical: "इलेक्ट्रिकल (वीज काम)",
    Plumbing: "प्लंबिंग (नळ-पाईप काम)",
    Painting: "रंगकाम (पेंटिंग)",
    Carpentry: "सुतारकाम (कारपेंटरी)",
    Other: "इतर",
  },
  areas: {
    Baner: "बाणेर",
    Hinjawadi: "हिंजवडी",
    Wakad: "वाकड",
    Kharadi: "खराडी",
    Hadapsar: "हडपसर",
    Kothrud: "कोथरूड",
    Other: "इतर (पुण्यातील दुसरा परिसर लिहा)",
  },
  availability: {
    now: "आता उपलब्ध आहे",
    from_date: "विशिष्ट तारखेपासून उपलब्ध",
    unavailable: "सध्या उपलब्ध नाही",
  },
  register: {
    title: "कंत्राटदार नोंदणी",
    intro: "तुमचे काम (ट्रेड) आणि तुम्ही पुण्यात कुठे काम करता ते सांगा. यासाठी सुमारे एक मिनिट लागतो.",
    noteTitle: "तुमची माहिती कशी वापरली जाते.",
    noteBody:
      "तुमचा मोबाइल नंबर खाजगीरित्या जतन केला जातो आणि सार्वजनिकपणे दाखवला जात नाही. खालील संमती बॉक्समध्ये सांगितल्याप्रमाणे तो कामाच्या संधींसाठी संबंधित डेव्हलपर्ससोबत शेअर केला जाऊ शकतो. नोंदणी झाली म्हणजे तुम्ही पडताळलेले आहात किंवा तुम्हाला काम मिळण्याची हमी आहे असे नाही. माहिती हटवण्यासाठी हा फॉर्म तुम्हाला ज्यांनी दिला त्यांच्याशी संपर्क साधा.",
    nameLabel: "कंत्राटदाराचे नाव",
    namePlaceholder: "उदा. रमेश पाटील",
    tradeLabel: "मुख्य काम (ट्रेड)",
    tradePlaceholder: "तुमचे काम निवडा",
    areaLabel: "सेवा क्षेत्र",
    areaPlaceholder: "पुण्यातील परिसर निवडा",
    otherAreaLabel: "पुण्यातील दुसरा परिसर",
    otherAreaPlaceholder: "उदा. वाघोली",
    availabilityLabel: "उपलब्धता",
    availableFrom: "या तारखेपासून उपलब्ध",
    phoneLabel: "मोबाइल नंबर",
    phonePlaceholder: "उदा. 98765 43210 किंवा +91 98765 43210",
    phoneHint: "10 अंकी भारतीय मोबाइल नंबर. +91 लावणे ऐच्छिक आहे.",
    submit: "नोंदणी करा",
    submitting: "पाठवत आहे…",
    success: "धन्यवाद. तुमची नोंदणी मिळाली आहे आणि खाजगीरित्या जतन केली आहे.",
    testMode: "टेस्ट मोड: हे TEST रेकॉर्ड म्हणून जतन केले आहे, खरी नोंदणी नाही.",
    failed: "क्षमस्व, आम्ही तुमची नोंदणी जतन करू शकलो नाही. काहीही जतन झाले नाही. कृपया नंतर पुन्हा प्रयत्न करा.",
  },
  request: {
    title: "कामातील अडथळ्याबद्दल सांगा",
    intro:
      "तुमच्या शब्दांत सांगा काय झाले आणि तुम्हाला काय हवे आहे, मग तपशील भरा. काहीही जतन करण्यापूर्वी तुम्ही सर्व काही स्वतः तपासता.",
    noteTitle: "सुरू करण्यापूर्वी.",
    noteBody:
      "खरे अर्ज कोणत्याही AI सेवेला पाठवले जात नाहीत: तपशील तुम्ही स्वतः भरता. (Google चे Gemini AI फक्त आमच्या स्वतःच्या चाचण्यांमध्ये, काल्पनिक मजकुरासह वापरले जाते.) कृपया वर्णनात वैयक्तिक माहिती लिहू नका. अर्ज जतन केल्याने कोणत्याही कंत्राटदाराशी संपर्क किंवा जुळवणी होत नाही.",
    descriptionLabel: "काय झाले, आणि तुम्हाला काय हवे आहे?",
    descriptionPlaceholder:
      "उदा. बाणेर साइटवरील आमचा प्लंबिंग कंत्राटदार काम अर्धवट सोडून गेला. आम्हाला पुढच्या सोमवारपासून सुमारे दोन आठवड्यांसाठी नवीन प्लंबर हवा आहे.",
    charCount: "{n}/{max} अक्षरे",
    continue: "पुढे जा",
    pleaseWait: "कृपया थांबा…",
    editAgain: "वर्णन बदला आणि पुन्हा सुरू करा",
    noticeManual: "कृपया खालील तपशील स्वतः भरा. तुमचे वर्णन कोणत्याही AI सेवेला पाठवले गेले नाही.",
    noticeReadFailed: "आम्ही तुमचे वर्णन आपोआप वाचू शकलो नाही. कृपया खालील तपशील स्वतः भरा.",
    noticeAi:
      "सिंथेटिक टेस्ट मोड: हे तपशील आपोआप वाचले आहेत आणि चुकीचे असू शकतात. जतन करण्यापूर्वी प्रत्येक रकाना तपासा.",
    moreDetail: "आम्हाला आणखी थोडी माहिती हवी आहे:",
    tradeLabel: "कोणते काम हवे",
    tradePlaceholder: "काम निवडा",
    areaLabel: "साइटचा परिसर (पुण्यात)",
    areaPlaceholder: "उदा. बाणेर",
    startLabel: "केव्हापासून हवे",
    durationLabel: "अंदाजे कालावधी (दिवसांत)",
    durationPlaceholder: "उदा. 14",
    notesLabel: "इतर टिपणी",
    nameLabel: "तुमचे नाव किंवा कंपनी",
    phoneLabel: "तुमचा मोबाइल नंबर",
    phonePlaceholder: "उदा. 98765 43210 किंवा +91 98765 43210",
    phoneHint: "आमच्या खाजगी नोंदीत ठेवला जातो. तो कोणत्याही AI सेवेला पाठवला जात नाही.",
    save: "अर्ज जतन करा",
    saving: "जतन करत आहे…",
    saved:
      "धन्यवाद. तुमचा अर्ज मिळाला आहे आणि खाजगीरित्या जतन केला आहे. अजून कोणत्याही कंत्राटदाराशी संपर्क किंवा जुळवणी झालेली नाही.",
    testMode: "टेस्ट मोड: हा TEST रेकॉर्ड म्हणून जतन केला आहे, खरा अर्ज नाही.",
    another: "आणखी एक अर्ज पाठवा",
    failedSave: "क्षमस्व, आम्ही तुमचा अर्ज जतन करू शकलो नाही. काहीही जतन झाले नाही. कृपया नंतर पुन्हा प्रयत्न करा.",
    translationPending:
      "तुमचा मूळ मजकूर तुम्ही लिहिल्याप्रमाणेच जतन केला आहे. आमच्या टीमसाठी इंग्रजी रूप अजून बाकी आहे.",
    translationFailed:
      "तुमचा मूळ मजकूर तुम्ही लिहिल्याप्रमाणेच जतन केला आहे. त्याचे इंग्रजी भाषांतर सध्या उपलब्ध नाही.",
  },
  consent: {
    contractor:
      "माझी संपर्क माहिती खाजगीरित्या जतन केली जाईल आणि कंत्राटी कामाच्या संधींसाठी संबंधित डेव्हलपर्ससोबत शेअर केली जाऊ शकते, याला माझी संमती आहे. मला माझी माहिती हटवण्याची विनंती करता येते, हे मला समजते.",
    request:
      "मी दिलेली माहिती खाजगीरित्या जतन केली जाईल आणि या गरजेसाठी कंत्राटदार शोधण्यासाठी वापरली जाईल, तसेच या गरजेबद्दल माझ्याशी संपर्क साधला जाऊ शकतो, याला माझी संमती आहे. माझी माहिती कोणत्याही AI सेवेला पाठवली जात नाही. मला माझी माहिती हटवण्याची विनंती करता येते, हे मला समजते.",
  },
  validation: {
    nameTooLong: "नाव 80 अक्षरांपेक्षा जास्त नसावे.",
    chooseTrade: "कृपया तुमचे मुख्य काम (ट्रेड) निवडा.",
    chooseArea: "कृपया तुमचे सेवा क्षेत्र निवडा.",
    enterOtherArea: "कृपया तुम्ही ज्या पुण्यातील परिसरात काम करता तो लिहा.",
    otherAreaTooLong: "परिसराचे नाव 60 अक्षरांपेक्षा जास्त नसावे.",
    otherAreaChars: "फक्त अक्षरे, अंक आणि साधी विरामचिन्हे वापरा.",
    areaFromList: "कृपया यादीतून सेवा क्षेत्र निवडा.",
    chooseAvailability: "कृपया तुमची उपलब्धता सांगा.",
    chooseAvailableDate: "कृपया तुम्ही ज्या तारखेपासून उपलब्ध व्हाल ती निवडा.",
    validDate: "कृपया योग्य तारीख लिहा.",
    datePast: "तारीख भूतकाळातील असू शकत नाही.",
    enterPhone: "कृपया तुमचा मोबाइल नंबर लिहा.",
    phoneFormat: "6-9 ने सुरू होणारा 10 अंकी भारतीय मोबाइल नंबर लिहा; +91 ऐच्छिक आहे.",
    consentRegister: "नोंदणीसाठी संमती आवश्यक आहे.",
    descriptionShort: "कृपया परिस्थिती किमान {min} अक्षरांत सांगा.",
    descriptionLong: "कृपया वर्णन {max} अक्षरांपेक्षा कमी ठेवा.",
    descriptionRange: "कृपया परिस्थिती {min} ते {max} अक्षरांत सांगा.",
    enterPhoneRequest: "कृपया असा मोबाइल नंबर लिहा ज्यावर आम्ही तुमच्याशी संपर्क साधू शकू.",
    chooseTradeRequest: "कृपया तुम्हाला हवे असलेले काम (ट्रेड) निवडा.",
    enterSiteArea: "कृपया साइटचा पुण्यातील परिसर लिहा.",
    siteAreaChars: "2-60 अक्षरे, अंक किंवा साधी विरामचिन्हे वापरा.",
    durationRange: "1 ते {max} पर्यंत दिवसांची पूर्ण संख्या लिहा.",
    notesTooLong: "टिपणी {max} अक्षरांपेक्षा जास्त नसावी.",
    consentRequest: "अर्ज पाठवण्यासाठी संमती आवश्यक आहे.",
  },
};

const DICTIONARIES: Record<LanguageCode, Dict> = { en: EN, hi: HI, mr: MR };

export function getDict(language: LanguageCode): Dict {
  return DICTIONARIES[language] ?? EN;
}

// "Please fix {n} problems below." + { n: 3 } -> "Please fix 3 problems below."
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

// ---------------------------------------------------------------------------
// Validation messages. The validators (lib/registration.ts, lib/request.ts)
// keep returning their English text, so their rules and tests are untouched.
// A screen passes that text here to show it in the person's language. A message
// that is not in the table is returned unchanged (English), never invented.
// ---------------------------------------------------------------------------

type MessageMatcher = { key: ValidationKey; regex: RegExp; names: string[] };

function matcherFor(key: ValidationKey): MessageMatcher {
  const template = EN.validation[key];
  const names: string[] = [];
  const pattern = template
    .split(/(\{\w+\})/)
    .map((part) => {
      const m = /^\{(\w+)\}$/.exec(part);
      if (m) {
        names.push(m[1]);
        return "(\\d+)";
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return { key, regex: new RegExp(`^${pattern}$`), names };
}

const MATCHERS: MessageMatcher[] = (Object.keys(EN.validation) as ValidationKey[]).map(matcherFor);

export function validationKeyOf(english: string): { key: ValidationKey; vars: Record<string, string> } | null {
  for (const matcher of MATCHERS) {
    const m = matcher.regex.exec(english);
    if (m) {
      const vars: Record<string, string> = {};
      matcher.names.forEach((name, i) => {
        vars[name] = m[i + 1];
      });
      return { key: matcher.key, vars };
    }
  }
  return null;
}

export function translateMessage(language: LanguageCode, english: string | undefined): string | undefined {
  if (english === undefined || language === "en") return english;
  const found = validationKeyOf(english);
  if (!found) return english;
  return fill(getDict(language).validation[found.key], found.vars);
}

export const ENGLISH_VALIDATION = EN.validation;
