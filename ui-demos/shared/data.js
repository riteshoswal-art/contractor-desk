/* Contractor Desk UI demos: sample data and translated text.
 *
 * Everything here is MADE UP for the design review. No real person, phone
 * number or record is used. The Hindi and Marathi text is copied from the app
 * (lib/i18n.ts), and still needs a native speaker's review.
 */
window.CD_DATA = (function () {
  "use strict";

  const request = {
    id: "R-SAMPLE01",
    trade: "Plumbing",
    area: "Baner",
    startDate: "2026-10-27",
    durationDays: 14,
    developer: "Sample Developer Pvt Ltd",
    description:
      "Our plumbing contractor at the Baner site left halfway through. We need a replacement plumber from next Monday for about two weeks.",
    status: "Bidding open",
    received: "2026-10-22",
  };

  // Matches for the request, in the app's real order: exact date first,
  // then 1 day later, then 2 days later.
  const contractors = [
    {
      id: "C-SAMPLE0A", name: "Ramesh K.", initials: "RK", area: "Baner", fit: "exact",
      startText: "Said available from the requested date (their own statement)",
      bid: { amount: 22, unit: "per_sqft", notes: "Includes labour and fittings. Material by the developer." },
      rating: { count: 5, average: 4.6, criteria: [["Workmanship", 4.8, 5], ["Punctuality", 4.2, 5], ["Communication", 4.6, 5]] },
      comments: [
        { text: "Finished the bathroom lines two days early and left the site clean.", score: 5, date: "2026-09-12", lang: "en" },
        { text: "काम अच्छा था, बस शुरू होने में एक दिन की देर हुई।", score: 4, date: "2026-08-03", lang: "hi", pending: true },
      ],
      standing: "eligible",
    },
    {
      id: "C-SAMPLE0B", name: "Sunil M.", initials: "SM", area: "Baner", fit: "near1",
      startText: "Available from 28 Oct, 1 day after the requested date. Not confirmed yet.",
      bid: { amount: 19.5, unit: "per_sqft", notes: "Rate for concealed piping only." },
      rating: null,
      comments: [],
      standing: "provisional",
    },
    {
      id: "C-SAMPLE0C", name: "Imran S.", initials: "IS", area: "Baner", fit: "near2",
      startText: "Confirmed for 29 Oct (2 days after the requested date)",
      bid: { amount: 1600, unit: "per_day", notes: "Team of two. Day rate per person." },
      rating: { count: 2, average: 4.0, criteria: [["Workmanship", 4.0, 2]] },
      comments: [{ text: "Good plumber, explains clearly what he is doing.", score: 4, date: "2026-07-21", lang: "en" }],
      standing: "eligible",
    },
    {
      id: "C-SAMPLE0D", name: "Prakash J.", initials: "PJ", area: "Baner", fit: "exact",
      startText: "Confirmed for 27 Oct (the requested date)",
      bid: { amount: 210000, unit: "fixed_scope", notes: "Complete plumbing for floors 3 to 5 as per the drawings shared." },
      rating: { count: 1, average: 5.0, criteria: [] },
      comments: [],
      standing: "eligible",
    },
    {
      id: "C-SAMPLE0E", name: "Vikas D.", initials: "VD", area: "Baner", fit: "exact",
      startText: "Said available now (their own statement)",
      bid: null, invited: "Link active, no bid yet",
      rating: null, comments: [], standing: "invited",
    },
  ];

  const requests = [
    { id: "R-SAMPLE01", trade: "Plumbing", area: "Baner", start: "2026-10-27", days: 14, state: "Bidding open", bids: 4, matches: 5 },
    { id: "R-SAMPLE02", trade: "Electrical", area: "Wakad", start: "2026-10-30", days: 10, state: "Awaiting matches", bids: 0, matches: 2 },
    { id: "R-SAMPLE03", trade: "Masonry", area: "Hinjawadi", start: "2026-11-03", days: 21, state: "Contractor selected", bids: 3, matches: 4 },
    { id: "R-SAMPLE04", trade: "Painting", area: "Kharadi", start: "2026-11-05", days: 7, state: "New requirement", bids: 0, matches: 3 },
    { id: "R-SAMPLE05", trade: "Carpentry", area: "Kothrud", start: "2026-10-12", days: 12, state: "Job completed", bids: 2, matches: 3 },
  ];

  const units = {
    per_sqft: "per sq ft",
    per_sqm: "per sq m",
    per_day: "per day",
    per_unit: "per unit",
    fixed_scope: "fixed, for the defined scope",
  };
  const unitHeadings = {
    per_sqft: "Priced per square foot",
    per_sqm: "Priced per square metre",
    per_day: "Priced per day",
    per_unit: "Priced per unit",
    fixed_scope: "Fixed price for the scope",
  };

  // Approximate positions on a schematic (not to scale) map of Pune.
  const localities = [
    { name: "Hinjawadi", x: 14, y: 30 }, { name: "Wakad", x: 28, y: 38 }, { name: "Baner", x: 38, y: 46 },
    { name: "Kothrud", x: 40, y: 70 }, { name: "Kharadi", x: 82, y: 40 }, { name: "Hadapsar", x: 78, y: 72 },
  ];

  const text = {
    en: {
      langName: "English",
      register: {
        title: "Contractor registration",
        intro: "Tell us your trade and where you work in Pune. This takes about a minute.",
        name: "Contractor name", namePh: "e.g. Ramesh Patil",
        trade: "Primary trade", area: "Service area", availability: "Availability",
        now: "Available now", from: "From a date", unavailable: "Not available",
        phone: "Mobile number", phoneHint: "10-digit Indian mobile number. +91 is optional.",
        consent: "I agree that my contact details will be stored privately and may be shared with relevant developers for work opportunities. I can ask for deletion.",
        note: "Being registered does not mean you are verified or guaranteed any work.",
        submit: "Register", success: "Thank you. Your registration has been received and stored privately.",
        errTrade: "Please choose your primary trade.", errArea: "Please choose your service area.",
        errPhone: "Enter a 10-digit Indian mobile number starting with 6-9, with optional +91.", errConsent: "Consent is required to register.",
      },
      bid: {
        title: "Send your price for this job",
        intro: "You have been invited to bid for the job below. Please give your price and how it is charged.",
        job: "The job", jobLine: "{trade} job in {area}", needed: "Needed from {date}", duration: "About {days} days",
        amount: "Your price (in rupees)", amountHelp: "Numbers only, for example 1250 or 1250.50",
        unit: "How is this price charged?",
        units: { per_sqft: "Per square foot", per_sqm: "Per square metre", per_day: "Per day", per_unit: "Per unit", fixed_scope: "Fixed price for the whole job" },
        notes: "Notes about your price or the work",
        once: "You can send only one bid for this job. After you send it, you cannot change it or send another.",
        provisional: "Your start date for this job still needs to be confirmed. Your price will count only after that.",
        submit: "Send my bid", thanks: "Thank you. Your bid has been received.",
        errAmount: "Please enter your price.", errZero: "The price must be more than zero.", errUnit: "Please choose a rate unit.",
      },
      review: {
        title: "Rate the completed job",
        intro: "Please tell us how the work went. Your feedback helps other developers choose contractors.",
        job: "The job you are reviewing",
        overall: "Overall rating", overallHelp: "1 = very poor, 5 = excellent",
        workmanship: "Quality of the work", punctuality: "Finishing on time", communication: "Communication",
        comment: "Written feedback", commentHelp: "Please do not include phone numbers or personal details.",
        submit: "Send my review", thanks: "Thank you. Your review has been received.", errOverall: "Please give an overall score from 1 to 5.",
      },
      trades: { Plumbing: "Plumbing", Masonry: "Masonry", Electrical: "Electrical", Painting: "Painting", Carpentry: "Carpentry" },
      areas: { Baner: "Baner", Wakad: "Wakad", Hinjawadi: "Hinjawadi", Kharadi: "Kharadi", Kothrud: "Kothrud", Hadapsar: "Hadapsar" },
      optional: "optional",
    },
    hi: {
      langName: "हिन्दी",
      register: {
        title: "ठेकेदार पंजीकरण",
        intro: "हमें अपना काम (ट्रेड) और पुणे में जहाँ आप काम करते हैं, बताइए। इसमें करीब एक मिनट लगता है।",
        name: "ठेकेदार का नाम", namePh: "जैसे: रमेश पाटिल",
        trade: "मुख्य काम (ट्रेड)", area: "सेवा क्षेत्र", availability: "उपलब्धता",
        now: "अभी उपलब्ध हूँ", from: "किसी तारीख से", unavailable: "उपलब्ध नहीं",
        phone: "मोबाइल नंबर", phoneHint: "10 अंकों का भारतीय मोबाइल नंबर। +91 लगाना ज़रूरी नहीं है।",
        consent: "मैं सहमत हूँ कि मेरी संपर्क जानकारी निजी रूप से रखी जाएगी और काम के अवसरों के लिए संबंधित डेवलपर्स के साथ साझा की जा सकती है। मैं जानकारी हटवाने के लिए कह सकता/सकती हूँ।",
        note: "पंजीकृत होने का मतलब यह नहीं कि आप सत्यापित हैं या आपको काम की गारंटी है।",
        submit: "पंजीकरण करें", success: "धन्यवाद। आपका पंजीकरण मिल गया है और निजी रूप से सुरक्षित रखा गया है।",
        errTrade: "कृपया अपना मुख्य काम (ट्रेड) चुनें।", errArea: "कृपया अपना सेवा क्षेत्र चुनें।",
        errPhone: "6-9 से शुरू होने वाला 10 अंकों का भारतीय मोबाइल नंबर लिखें; +91 वैकल्पिक है।", errConsent: "पंजीकरण के लिए सहमति ज़रूरी है।",
      },
      bid: {
        title: "इस काम के लिए अपनी कीमत भेजें",
        intro: "आपको नीचे दिए गए काम के लिए बोली लगाने के लिए बुलाया गया है। कृपया अपनी कीमत और वह कैसे ली जाती है, बताइए।",
        job: "काम", jobLine: "{area} में {trade} का काम", needed: "{date} से चाहिए", duration: "लगभग {days} दिन",
        amount: "आपकी कीमत (रुपये में)", amountHelp: "केवल अंक, जैसे 1250 या 1250.50",
        unit: "यह कीमत कैसे ली जाती है?",
        units: { per_sqft: "प्रति वर्ग फुट", per_sqm: "प्रति वर्ग मीटर", per_day: "प्रति दिन", per_unit: "प्रति इकाई", fixed_scope: "बताए गए पूरे काम के लिए तय कीमत" },
        notes: "आपकी कीमत या काम के बारे में नोट",
        once: "आप इस काम के लिए केवल एक बोली भेज सकते हैं। भेजने के बाद आप उसे बदल नहीं सकते और न ही दूसरी बोली भेज सकते हैं।",
        provisional: "इस काम के लिए आपकी शुरुआत की तारीख की पुष्टि होनी बाकी है। आपकी कीमत उसके बाद ही गिनी जाएगी।",
        submit: "मेरी बोली भेजें", thanks: "धन्यवाद। आपकी बोली मिल गई है।",
        errAmount: "कृपया अपनी कीमत लिखें।", errZero: "कीमत शून्य से अधिक होनी चाहिए।", errUnit: "कृपया दर की इकाई चुनें।",
      },
      review: {
        title: "पूरे हुए काम को रेटिंग दें",
        intro: "कृपया बताइए कि काम कैसा रहा। आपकी राय से दूसरे डेवलपर्स को ठेकेदार चुनने में मदद मिलती है।",
        job: "जिस काम की समीक्षा कर रहे हैं",
        overall: "कुल रेटिंग", overallHelp: "1 = बहुत खराब, 5 = बहुत बढ़िया",
        workmanship: "काम की गुणवत्ता", punctuality: "समय पर पूरा करना", communication: "बातचीत और तालमेल",
        comment: "लिखित राय", commentHelp: "कृपया फ़ोन नंबर या निजी जानकारी न लिखें।",
        submit: "मेरी समीक्षा भेजें", thanks: "धन्यवाद। आपकी समीक्षा मिल गई है।", errOverall: "कृपया 1 से 5 तक कुल रेटिंग दें।",
      },
      trades: { Plumbing: "प्लंबिंग (नल-पाइप का काम)", Masonry: "चिनाई / राजमिस्त्री", Electrical: "इलेक्ट्रिकल (बिजली का काम)", Painting: "पेंटिंग (रंग-रोगन)", Carpentry: "बढ़ईगिरी (कारपेंटरी)" },
      areas: { Baner: "बाणेर", Wakad: "वाकड", Hinjawadi: "हिंजवडी", Kharadi: "खराडी", Kothrud: "कोथरूड", Hadapsar: "हडपसर" },
      optional: "वैकल्पिक",
    },
    mr: {
      langName: "मराठी",
      register: {
        title: "कंत्राटदार नोंदणी",
        intro: "तुमचे काम (ट्रेड) आणि तुम्ही पुण्यात कुठे काम करता ते सांगा. यासाठी सुमारे एक मिनिट लागतो.",
        name: "कंत्राटदाराचे नाव", namePh: "उदा. रमेश पाटील",
        trade: "मुख्य काम (ट्रेड)", area: "सेवा क्षेत्र", availability: "उपलब्धता",
        now: "आता उपलब्ध आहे", from: "तारखेपासून", unavailable: "उपलब्ध नाही",
        phone: "मोबाइल नंबर", phoneHint: "10 अंकी भारतीय मोबाइल नंबर. +91 लावणे ऐच्छिक आहे.",
        consent: "माझी संपर्क माहिती खाजगीरित्या जतन केली जाईल आणि कामाच्या संधींसाठी संबंधित डेव्हलपर्ससोबत शेअर केली जाऊ शकते, याला मी संमती देतो/देते. मी माहिती हटवण्याची विनंती करू शकतो/शकते.",
        note: "नोंदणी झाली म्हणजे तुम्ही पडताळलेले आहात किंवा काम मिळण्याची हमी आहे असे नाही.",
        submit: "नोंदणी करा", success: "धन्यवाद. तुमची नोंदणी मिळाली आहे आणि खाजगीरित्या जतन केली आहे.",
        errTrade: "कृपया तुमचे मुख्य काम (ट्रेड) निवडा.", errArea: "कृपया तुमचे सेवा क्षेत्र निवडा.",
        errPhone: "6-9 ने सुरू होणारा 10 अंकी भारतीय मोबाइल नंबर लिहा; +91 ऐच्छिक आहे.", errConsent: "नोंदणीसाठी संमती आवश्यक आहे.",
      },
      bid: {
        title: "या कामासाठी तुमची किंमत पाठवा",
        intro: "खाली दिलेल्या कामासाठी बोली लावण्यासाठी तुम्हाला बोलावले आहे. कृपया तुमची किंमत आणि ती कशी आकारली जाते ते सांगा.",
        job: "काम", jobLine: "{area} मधील {trade} काम", needed: "{date} पासून हवे", duration: "सुमारे {days} दिवस",
        amount: "तुमची किंमत (रुपयांत)", amountHelp: "फक्त अंक, उदा. 1250 किंवा 1250.50",
        unit: "ही किंमत कशी आकारली जाते?",
        units: { per_sqft: "प्रति चौरस फूट", per_sqm: "प्रति चौरस मीटर", per_day: "प्रति दिवस", per_unit: "प्रति नग", fixed_scope: "संपूर्ण कामासाठी ठरलेली किंमत" },
        notes: "तुमच्या किमतीबद्दल किंवा कामाबद्दल टिप्पणी",
        once: "या कामासाठी तुम्ही फक्त एकच बोली पाठवू शकता. पाठवल्यानंतर ती बदलता येत नाही आणि दुसरी पाठवता येत नाही.",
        provisional: "या कामासाठी तुमच्या सुरू करण्याच्या तारखेची खात्री अजून व्हायची आहे. त्यानंतरच तुमची किंमत ग्राह्य धरली जाईल.",
        submit: "माझी बोली पाठवा", thanks: "धन्यवाद. तुमची बोली मिळाली आहे.",
        errAmount: "कृपया तुमची किंमत लिहा.", errZero: "किंमत शून्यापेक्षा जास्त असावी.", errUnit: "कृपया दराचे एकक निवडा.",
      },
      review: {
        title: "पूर्ण झालेल्या कामाला रेटिंग द्या",
        intro: "कृपया काम कसे झाले ते सांगा. तुमच्या अभिप्रायामुळे इतर डेव्हलपर्सना कंत्राटदार निवडण्यास मदत होते.",
        job: "ज्या कामाचे परीक्षण करत आहात",
        overall: "एकूण रेटिंग", overallHelp: "1 = खूप वाईट, 5 = उत्कृष्ट",
        workmanship: "कामाचा दर्जा", punctuality: "वेळेवर पूर्ण करणे", communication: "संवाद",
        comment: "लेखी अभिप्राय", commentHelp: "कृपया फोन नंबर किंवा वैयक्तिक माहिती लिहू नका.",
        submit: "माझे परीक्षण पाठवा", thanks: "धन्यवाद. तुमचे परीक्षण मिळाले आहे.", errOverall: "कृपया 1 ते 5 पर्यंत एकूण रेटिंग द्या.",
      },
      trades: { Plumbing: "प्लंबिंग (नळ-पाईप काम)", Masonry: "गवंडीकाम (चिनाई)", Electrical: "इलेक्ट्रिकल (वीज काम)", Painting: "रंगकाम (पेंटिंग)", Carpentry: "सुतारकाम (कारपेंटरी)" },
      areas: { Baner: "बाणेर", Wakad: "वाकड", Hinjawadi: "हिंजवडी", Kharadi: "खराडी", Kothrud: "कोथरूड", Hadapsar: "हडपसर" },
      optional: "ऐच्छिक",
    },
  };

  return { request, contractors, requests, units, unitHeadings, localities, text };
})();
