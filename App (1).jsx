import { useState, useMemo, useEffect, useRef } from "react";

/* ══════════════════════════════════════ */
/* TRANSLATIONS — Arabic + Hebrew         */
/* ══════════════════════════════════════ */
const STRINGS = {
  ar: {
    nav_home: "الرئيسية", nav_about: "من نحن", nav_services: "خدماتنا", nav_pricing: "الأسعار", nav_portal: "بوابة العريس",
    hero_subtitle: "تخدم حفلات الأعراس والمناسبات في جميع أنحاء البلاد",
    hero_tagline1: "أول منصة متخصصة في توزيع مكاتيب الأفراح",
    hero_tagline2: "بالطريقة الاحترافية والراقية",
    hero_brand_pitch: "نقلة نوعية في بريستيج عرسك",
    hero_cta_start: "← ابدأ مع عريسك", hero_cta_explore: "اكتشف خدماتنا",
    about_label: "من نحن", about_title: "لماذا دعوة تغيّر كل شيء؟",
    feat1_title: "وفّر وقتك", feat1_body: "لا تضيّع أيام توزع مكاتيب بنفسك، إحنا نهتم بكل شيء. أنت بس تحدد القائمة — وتتابع من موبايلك وأنت مرتاح.",
    feat2_title: "مكاتيب تليق بفرحك", feat2_body: "مكاتيب مطبوعة بورق فاخر وتصميم يخلي ضيوفك يتكلموا عنها قبل ما يجوا العرس.",
    feat3_title: "تتبع حي لكل مكتوب", feat3_body: "كل مكتوب مسلّم تشوف صورته ووقته واسم من سلّمه — شفافية كاملة وراحة بال حقيقية.",
    feat4_title: "موزعون بزي رسمي", feat4_body: "فريقنا يصل بزي أنيق ويسلّم المكتوب باحتراف، وهاد بحد ذاته رسالة بريستيج قبل الفرح.",
    pers_title: "فكّر معي دقيقة واحدة",
    pers_body_full: ["يوم الفرح أصعب يوم تمر فيه — الكوافير، القاعة، التصوير، العيلة، الأهل...","وبعدين يجي همّ ","توزيع المكاتيب","؟","مع دعوة، أنت بتحدد قائمة أسمائك وعناوينهم، ونحن نتولى الباقي. توزيع سريع باحترافية، وأنت تتابع كل مكتوب من موبايلك لحظة بلحظة.","راحة بال — ضرورة لكل عريس يحترم وقته وبريستيجه"],
    pers_cta: "احجز الآن ←",
    services_label: "خدماتنا", services_title: "مكاتيب تستحق فرحك",
    services_subtitle: "عندنا نوعان من المكاتيب — كلاهما يمكن استخدامهما معاً في نفس الفرح",
    feature_section: "ما يميز هذا النوع",
    both_types_note: "يمكن استخدام النوعين معاً في نفس الفرح",
    delivery_title: "طريقة التوصيل",
    delivery_subtitle: "توصيل سريع واحترافي",
    delivery_body_lines: ["نلتزم بتسليم مكاتيبك في أسرع وقت ممكن","بموزعين محترفين بزي رسمي","مع صورة إثبات لكل تسليم"],
    pricing_label: "الأسعار", pricing_title: "نوعان من الأسعار",
    pricing_subtitle: "تواصل معنا للحصول على عرض سعر مخصص لفرحك",
    price_premium_title: "سعر الدعوة الفاخرة", price_premium_discount: "أرخص بـ 50%", price_premium_vs: "مقارنة بالباقة VIP",
    price_premium_body: "الخيار الأمثل لقائمة الدعوات الكاملة",
    price_vip_badge: "الباقة المميزة",
    price_vip_title: "سعر الدعوة الملكية VIP", price_vip_normal: "السعر العادي", price_vip_pitch: "تجربة فخامة لا مثيل لها",
    price_vip_body: "مثالية لكبار الضيوف والعيلة المقربة",
    price_contact: "تواصل للحجز",
    price_both_note: "يمكنك استخدام النوعين معاً في نفس الفرح — مكاتيب فاخرة للقائمة العامة، و VIP لضيوف خاصين",
    footer_tagline: "منصة توزيع مكاتيب الأفراح الاحترافية",
    login_title: "تسجيل الدخول", login_subtitle: "بوابة العريس · برنامج المرسل",
    login_user: "اسم المستخدم", login_pass: "كلمة المرور", login_submit: "← دخول",
    login_error: "اسم المستخدم أو كلمة المرور غير صحيحة",
    login_hint: "بياناتك تصلك من فريق دعوة بعد الحجز", login_back: "← رجوع",
    tab_dashboard: "لوحة التحكم", tab_guests: "المدعوون", tab_add: "➕ إضافة", tab_proofs: "الإثباتات", tab_live: "موقع المرسل", tab_admin: "إدارة",
    dash_welcome: "أهلاً بك في لوحة التحكم", dash_subtitle: "تابع توزيع مكاتيبك لحظة بلحظة",
    stat_total: "الإجمالي", stat_delivered: "تم التسليم", stat_enroute: "في الطريق", stat_pending: "لم يبدأ",
    progress_label: "نسبة التوزيع", last_deliveries: "آخر التسليمات", arrived: "✓ وصل",
    guests_count: "قائمة المدعوين", guests_empty: "لا يوجد مدعوون بعد — ابدأ بإضافة أول معزوم",
    guests_add_btn: "➕ إضافة معزوم", guests_edit: "✎ تعديل", guests_delete: "حذف",
    add_title: "إضافة معزوم جديد", edit_title: "تعديل بيانات المعزوم", add_subtitle: "اكتب بيانات المعزوم وسيتم إضافته إلى قائمتك",
    field_name: "الاسم الكامل *", field_phone: "رقم الهاتف *",
    field_address: "العنوان", field_address_optional: "(اختياري)",
    field_invite_type: "نوع المكتوب", type_premium: "✦ فاخر", type_vip: "♛ VIP",
    add_submit: "➕ إضافة المعزوم إلى القائمة", edit_save: "💾 حفظ التعديلات", edit_cancel: "إلغاء",
    add_tip: "💡 الاسم ورقم الهاتف ضروريان. العنوان اختياري — لكن إضافته يسهّل عمل المرسل بفتح الويز مباشرة على عنوان الضيف.",
    add_required_msg: "الاسم ورقم الهاتف مطلوبان",
    add_duplicate_msg: "تمت إضافة هذا المعزوم مسبقاً",
    add_success: "✓ تمت إضافة المعزوم", edit_success: "✓ تم حفظ التعديلات", delete_success: "تم حذف المعزوم",
    proofs_title: "إثباتات التسليم", proofs_distributor: "الموزع:", proofs_pending: "مكتوب بانتظار صورة الإثبات عند التسليم",
    live_title: "موقع المرسل المباشر",
    live_empty_title: "لم يقم المرسل بمشاركة موقعه بعد",
    live_empty_body: "سيظهر موقع المرسل هنا فور مشاركته للرابط من تطبيقه — تظل في لوحة تحكمك ولا تحتاج للخروج من الموقع",
    live_subtitle: "يظهر موقع المرسل الحالي مباشرة من خرائط جوجل",
    live_shared_at: "آخر تحديث:", live_open_new: "فتح في نافذة جديدة",
    driver_title: "برنامج المرسل", driver_subtitle: "قائمة التوصيل", driver_completed: "مكتمل",
    driver_remaining: "متبقي:", driver_done: "منجز:",
    driver_list_title: "قائمة التوصيل — مرتبة حسب البلدات والقرب",
    driver_next: "التالي", driver_call: "اتصال", driver_open_waze: "🗺 فتح في Waze",
    driver_no_address: "لا يوجد عنوان — اتصل بالضيف",
    driver_deliver_btn: "✉ تسليم المكتوب", driver_cancel: "إلغاء",
    driver_complete_form: "أكمل بيانات التسليم",
    driver_photo_label: "صورة الإثبات", driver_photo_optional: "(اختياري — اضغط إذا احتجت)",
    driver_photo_done: "تم التقاط الصورة", driver_photo_retake: "اضغط لإعادة التصوير",
    driver_photo_hint: "اضغط لفتح الكاميرا وتصوير الإثبات",
    driver_note_label: "ملاحظة (اختياري)", driver_note_placeholder: "مثال: تم التسليم لأخوه",
    driver_confirm: "✓ تأكيد التسليم وإشعار العريس",
    driver_done_section: "تم التسليم", driver_delivered_badge: "مسلّم",
    driver_all_done_title: "انتهيت من كل المكاتيب", driver_all_done_subtitle: "تم إشعار العريس بالاكتمال",
    share_section: "مشاركة موقعي مع العريس",
    share_label: "رابط رسالة الموقع الحي من Telegram",
    share_placeholder: "https://t.me/your_channel/123",
    share_save: "حفظ ومشاركة الموقع", share_stop: "إيقاف المشاركة",
    share_active: "✓ موقعك يُعرض الآن في لوحة العريس",
    share_hint: "📡 طريقة Telegram (8 ساعات تتبع تلقائي):\n1) افتح قناة Telegram عامة\n2) أرسل موقعك الحي (Live Location) فيها\n3) اضغط مطوّلاً على الرسالة → Copy Post Link\n4) الصق الرابط هنا — كل 8 ساعات أعد المشاركة برابط جديد",
    share_invalid: "يرجى لصق رابط Telegram صالح (https://t.me/...)",
    share_saved: "✓ تمت مشاركة الموقع مع العريس",
    share_stopped: "تم إيقاف مشاركة الموقع",
    open_in_telegram: "افتح الرسالة في Telegram",
    admin_title: "لوحة المدير", admin_subtitle: "إدارة بيانات المستخدمين — مرئية للمدير فقط",
    admin_users_count: "عدد المستخدمين",
    admin_add_user: "إضافة مستخدم جديد",
    admin_role: "النوع", admin_role_groom: "عريس", admin_role_driver: "مرسل",
    admin_existing: "المستخدمون الحاليون", admin_create: "إنشاء مستخدم", admin_delete: "حذف",
    admin_no_users: "لا يوجد مستخدمون", admin_added: "✓ تم إنشاء المستخدم", admin_deleted: "تم حذف المستخدم",
    admin_required: "اسم المستخدم وكلمة المرور مطلوبان", admin_taken: "اسم المستخدم محجوز",
    admin_warning: "أنت في وضع المدير — هذه اللوحة مرئية لك فقط",
    lang_label: "اللغة",
    // Logout
    logout: "خروج", logout_confirm_title: "تسجيل خروج",
    logout_confirm_body: "هل أنت متأكد من تسجيل الخروج من حسابك؟ سيتعين عليك إدخال بيانات الدخول مجدداً.",
    logout_confirm_yes: "نعم، اخرج", logout_confirm_no: "إلغاء",
    // Driver: pick groom after login
    driver_pick_groom_title: "لمَن تُسلِّم المكاتيب؟",
    driver_pick_groom_subtitle: "أدخل اسم مستخدم العريس الذي تعمل لحسابه. ستظهر لك قائمة مدعويه فقط.",
    driver_pick_groom_field: "اسم مستخدم العريس",
    driver_pick_groom_submit: "متابعة ←",
    driver_pick_groom_invalid: "اسم المستخدم غير موجود أو ليس عريساً",
    driver_pick_groom_change: "تغيير العريس",
    driver_serving_for: "تعمل للعريس:",
    // Shared cities feature
    tab_shared: "بلدات مشتركة",
    shared_title: "بلدات مشتركة بين عرسان",
    shared_subtitle: "وزِّع لعدة عرسان في نفس البلد بنفس الجولة — مرتبة جغرافياً",
    shared_pick_grooms_label: "اختر العرسان الذين تريد التوزيع لهم",
    shared_grooms_empty: "لا يوجد عرسان مسجلون بعد",
    shared_view_btn: "عرض البلدات المشتركة ←",
    shared_no_cities: "لا توجد بلدات مشتركة بين هؤلاء العرسان حالياً",
    shared_no_pending: "لا توجد مكاتيب معلَّقة لهؤلاء العرسان",
    shared_back_to_grooms: "← تغيير العرسان",
    shared_back_to_cities: "← اختر بلدة أخرى",
    shared_pick_city: "اختر بلدة لعرض جولة التوزيع",
    shared_route_in: "جولة التوزيع في:",
    shared_city_count: "مكتوب",
    for_groom: "للعريس:",
    // Map embed hint
    live_iframe_hint: "إذا لم تظهر الخريطة، تأكد أن المرسل لصق رابط Google Maps يحتوي على إحداثيات (مثل …@31.5,35.1,…) أو إحداثيات مباشرة (31.5,35.1)",
    share_pick_grooms: "اختر العرسان الذين سيرون موقعك",
    share_pick_grooms_required: "يجب اختيار عريس واحد على الأقل",
    share_active_with: "موقعك مُشارَك مع:",
    share_no_grooms_yet: "لا يوجد عرسان في النظام بعد",
    share_url_or_coords: "رابط Google Maps أو إحداثيات مباشرة",
    share_url_placeholder: "https://maps.google.com/... أو 31.5,35.1",
    no_driver_sharing: "لا يوجد مرسل يشارك موقعه معك حالياً",
    drivers_sharing_count: "مرسل يشارك موقعه",
    driver_label: "المرسل:",
    photo_view: "عرض الصورة",
    photo_close: "إغلاق",
    photo_no_image: "لا توجد صورة",
    share_use_my_location: "📍 استخدم موقعي الحالي",
    share_hint_v2: "اضغط «استخدم موقعي الحالي» أو الصق رابط Google Maps يحتوي على إحداثيات مثل @31.5,35.1 (لا يعمل الرابط القصير maps.app.goo.gl)",
    // Validation
    name_invalid_words: "يرجى إدخال الاسم الكامل (اسم وكنية على الأقل، مثال: رواد حجير)",
    phone_invalid_digits: "رقم الهاتف يجب أن يحتوي على أرقام فقط",
    phone_invalid_short: "ينقص رقمك",
    phone_invalid_extra: "رقمك يزيد",
    phone_invalid_digit_label: "رقم",
    phone_invalid_digits_label: "أرقام",
    // Field examples
    example_name: "مثال: رواد حجير",
    example_phone: "مثال: 0524264094",
    example_address: "مثال: حيفا، شارع النبي 86",
    addr_loading: "🔍 جاري البحث في الخرائط...",
    addr_no_matches: "لا توجد نتائج — تابع الكتابة أو اكتب يدوياً",
    addr_powered: "نتائج من OpenStreetMap",
    guests_with_address: "📍 المدعوون مع عنوان",
    guests_without_address: "⌛ المدعوون بدون عنوان",
    guests_without_hint: "هؤلاء المدعوون ينقصهم عنوان — أضف لكل منهم عنواناً ليتمكن المرسل من إيصال المكتوب",
    addr_city_field: "البلدة",
    addr_city_placeholder: "ابدأ بكتابة اسم البلدة (مثال: حيفا)",
    addr_street_field: "اسم الشارع / المنطقة",
    addr_street_placeholder: "اكتب اسم الشارع (مثال: شارع النبي 86)",
    addr_pick_city_first: "اختر البلدة أولاً",
    // Admin WhatsApp send
    admin_tab_users: "المستخدمون",
    admin_tab_send: "إرسال الدعوات",
    admin_tab_confirmations: "التأكيدات",
    admin_tab_settings: "الإعدادات",
    admin_select_groom: "اختر العريس",
    admin_no_grooms: "لا يوجد عرسان في النظام بعد",
    admin_groom_guests_count: "عدد المدعوين:",
    admin_send_to_all: "📨 إرسال للجميع",
    admin_send_to_one: "📨 إرسال",
    admin_settings_title: "إعدادات الرسالة",
    admin_settings_subtitle: "الرسالة والرابط الذي ستُرسَل للمعزومين عبر WhatsApp",
    admin_msg_body: "نص الرسالة",
    admin_msg_placeholder: "شركة دعوة ترحب بكم\nنحن شركة متخصصة بتوصيل مكاتيب الأعراس...\n\nيُرجى تأكيد بياناتكم من خلال الرابط أدناه:",
    admin_form_link: "رابط نموذج التأكيد (يُرسَل في الرسالة)",
    admin_form_link_placeholder: "https://example.com/confirm",
    admin_save_settings: "💾 حفظ الإعدادات",
    admin_settings_saved: "✓ تم حفظ الإعدادات",
    admin_bulk_warn: "⚠ ستفتح نافذة WhatsApp لكل معزوم بشكل منفصل — السماح بالنوافذ المنبثقة مطلوب",
    admin_send_hint: "💡 ضغطة على «إرسال» تفتح نافذة WhatsApp مع الرسالة جاهزة لإرسالها للمعزوم",
    // Admin Confirmations
    admin_conf_title: "تأكيدات المعزومين",
    admin_conf_subtitle: "البيانات التي أرسلها المعزومون عبر نموذج التأكيد",
    admin_conf_empty: "لا توجد تأكيدات بعد",
    admin_conf_matched: "✓ مدعوّون متطابقون",
    admin_conf_unknown: "⚠ معزومون مجهولون (لا يوجد رقم مطابق)",
    admin_conf_from_groom: "بيانات العريس:",
    admin_conf_from_guest: "بيانات المعزوم:",
    admin_conf_edit: "✎ تعديل",
    admin_conf_use_guest_data: "اعتماد بيانات المعزوم",
    admin_conf_no_address: "بدون عنوان",
    admin_conf_for_groom: "للعريس:",
    // Guest confirmation form
    conf_form_welcome_title: "شركة دعوة ترحب بكم",
    conf_form_welcome_body: "نحن شركة دعوة — متخصصون في توصيل مكاتيب الأعراس بطريقة احترافية وراقية. تم تسجيلكم كأحد المدعوين الكرام، يُرجى تأكيد بياناتكم لتسهيل توصيل المكتوب إليكم.",
    conf_form_full_name: "الاسم الكامل",
    conf_form_phone: "رقم الهاتف",
    conf_form_city: "البلدة",
    conf_form_street: "اسم الشارع",
    conf_form_house_number: "رقم المنزل",
    conf_form_submit: "✓ تأكيد بياناتي",
    conf_form_thanks_title: "شكراً لك! ✓",
    conf_form_thanks_body: "تم استلام بياناتك. سيتم التواصل معكم قريباً لتوصيل المكتوب.",
    conf_form_invalid: "يرجى تعبئة جميع الحقول المطلوبة",
    share_geo_blocked_title: "تحديد الموقع محظور في هذه البيئة",
    share_geo_blocked_body: "بعض المتصفحات أو واجهات المعاينة تمنع الوصول للموقع. استخدم الطرق اليدوية البديلة:",
    share_help_btn: "كيف أحصل على إحداثياتي؟",
    share_help_close: "إخفاء",
    share_help_step1: "1️⃣ افتح Google Maps في تبويب جديد",
    share_help_step2: "2️⃣ اضغط مطوّلاً (موبايل) أو زر اليمين (كمبيوتر) على موقعك",
    share_help_step3: "3️⃣ ستظهر الإحداثيات (مثل 31.768, 35.214) — انسخها",
    share_help_step4: "4️⃣ الصقها في الخانة أدناه بالصيغة: 31.768,35.214",
    share_open_gmaps: "🗺 افتح Google Maps لأخذ الإحداثيات",
    share_manual_lat: "خط العرض (Latitude)",
    share_manual_lng: "خط الطول (Longitude)",
    share_manual_fill: "✓ استخدم هذه الإحداثيات",
    // Geolocation-based live tracking
    geo_not_supported: "متصفحك لا يدعم تحديد الموقع",
    geo_denied: "تم رفض إذن الوصول للموقع — يرجى السماح من إعدادات المتصفح",
    geo_requesting: "جارٍ طلب إذن الموقع...",
    geo_grant_btn_driver: "📍 السماح بمشاركة موقعي الحي",
    geo_grant_btn_groom: "📍 السماح بإظهار موقعي على الخريطة",
    geo_retry: "↻ إعادة المحاولة",
    geo_share_start: "📡 ابدأ بث موقعي الحي",
    geo_share_active: "✓ موقعك يُبَث الآن للعرسان المختارين",
    geo_share_stop: "إيقاف بث الموقع",
    geo_pick_grooms_first: "اختر عريساً واحداً على الأقل قبل بدء البث",
    geo_updating: "🔄 يُحدّث تلقائياً كل ثانية",
    geo_accuracy: "دقة الموقع:",
    geo_meters: "م",
    geo_hint_new: "📡 بنظام GPS مباشر — لا حاجة لروابط خارجية:\n1) اضغط السماح بمشاركة الموقع\n2) اختر العرسان الذين سيرونك على الخريطة\n3) ابدأ البث — كل من اخترته يراك يتحرك على الخريطة لحظة بلحظة",
    map_you: "أنت",
    map_driver: "المرسل",
    map_legend: "🗺 الخريطة الحية",
    map_no_location_yet: "اضغط على «السماح بإظهار موقعي» لرؤية الخريطة",
    map_loading: "جارٍ تحميل الخريطة...",
    map_drivers_count: "مرسل يبث موقعه",
    // Confirmation status badges on guest cards
    conf_status_matched: "✓ تأكيد مطابق",
    conf_status_mismatch: "⚠ بيانات غير مطابقة",
    conf_mismatch_name: "الاسم مختلف",
    conf_mismatch_city: "البلدة مختلفة",
    conf_mismatch_invalid_phone: "رقم الهاتف غير صالح",
    conf_mismatch_invalid_name: "الاسم غير مكتمل",
    conf_status_hint: "هذا المعزوم أرسل تأكيد بياناته، لكن بعض المعلومات لا تطابق ما أدخله العريس",
  },
  he: {
    nav_home: "ראשי", nav_about: "אודות", nav_services: "השירותים", nav_pricing: "מחירים", nav_portal: "פורטל החתן",
    hero_subtitle: "משרת חתונות ואירועים בכל רחבי הארץ",
    hero_tagline1: "הפלטפורמה הראשונה לחלוקת הזמנות חתונה",
    hero_tagline2: "בצורה מקצועית ויוקרתית",
    hero_brand_pitch: "קפיצת מדרגה ביוקרת החתונה שלך",
    hero_cta_start: "← התחל עם החתונה", hero_cta_explore: "גלה את השירותים",
    about_label: "אודות", about_title: "למה דעוה משנה הכל?",
    feat1_title: "חסוך זמן", feat1_body: "אל תבזבז ימים בחלוקת הזמנות לבד, אנחנו דואגים להכל. אתה רק קובע את הרשימה — ועוקב מהנייד שלך בנוחות.",
    feat2_title: "הזמנות הראויות לחתונתך", feat2_body: "הזמנות מודפסות על נייר יוקרתי ועיצוב שיגרום לאורחים שלך לדבר עליהן עוד לפני שיגיעו.",
    feat3_title: "מעקב חי לכל הזמנה", feat3_body: "כל הזמנה שנמסרה — תראה את התמונה, השעה ושם מי שמסר. שקיפות מלאה ושקט אמיתי.",
    feat4_title: "שליחים במדים רשמיים", feat4_body: "הצוות שלנו מגיע בלבוש מהודר ומוסר את ההזמנה במקצועיות — וזה לבדו מסר של יוקרה לפני החתונה.",
    pers_title: "חשוב איתי לרגע",
    pers_body_full: ["יום החתונה הוא היום הקשה ביותר — מעצבת שיער, אולם, צילום, משפחה, קרובים...","ועוד צרה של ","חלוקת ההזמנות","?","עם דעוה אתה קובע את רשימת השמות והכתובות, ואנחנו דואגים לשאר. חלוקה מהירה ומקצועית, ואתה עוקב אחר כל הזמנה מהנייד שלך בזמן אמת.","שקט נפשי — הכרחי לכל חתן שמכבד את זמנו ויוקרתו"],
    pers_cta: "הזמן עכשיו ←",
    services_label: "השירותים", services_title: "הזמנות שראויות לחתונתך",
    services_subtitle: "יש לנו שני סוגי הזמנות — שניהם ניתנים לשילוב באותה חתונה",
    feature_section: "מה מיוחד בסוג הזה",
    both_types_note: "ניתן לשלב את שני הסוגים באותה חתונה",
    delivery_title: "אופן המסירה",
    delivery_subtitle: "מסירה מהירה ומקצועית",
    delivery_body_lines: ["אנחנו מתחייבים למסור את ההזמנות שלך במהירות האפשרית","עם שליחים מקצועיים במדים רשמיים","ותמונת הוכחה לכל מסירה"],
    pricing_label: "מחירים", pricing_title: "שני סוגי מחירים",
    pricing_subtitle: "צור איתנו קשר לקבלת הצעת מחיר מותאמת לחתונה שלך",
    price_premium_title: "מחיר ההזמנה היוקרתית", price_premium_discount: "זול ב-50%", price_premium_vs: "ביחס לחבילת ה-VIP",
    price_premium_body: "האפשרות האידיאלית לרשימת ההזמנות המלאה",
    price_vip_badge: "החבילה המיוחדת",
    price_vip_title: "מחיר ההזמנה המלכותית VIP", price_vip_normal: "המחיר הרגיל", price_vip_pitch: "חוויה יוקרתית שאין כדוגמתה",
    price_vip_body: "אידיאלית לאורחי כבוד ולבני המשפחה הקרובה",
    price_contact: "צור קשר להזמנה",
    price_both_note: "ניתן לשלב את שני הסוגים באותה חתונה — הזמנות יוקרתיות לרשימה הכללית, ו-VIP לאורחים מיוחדים",
    footer_tagline: "פלטפורמת חלוקת הזמנות חתונה מקצועית",
    login_title: "התחברות", login_subtitle: "פורטל החתן · תוכנת השליח",
    login_user: "שם משתמש", login_pass: "סיסמה", login_submit: "← כניסה",
    login_error: "שם משתמש או סיסמה שגויים",
    login_hint: "פרטי הגישה שלך נשלחים מצוות דעוה לאחר ההזמנה", login_back: "← חזרה",
    tab_dashboard: "לוח בקרה", tab_guests: "מוזמנים", tab_add: "➕ הוספה", tab_proofs: "הוכחות", tab_live: "מיקום השליח", tab_admin: "ניהול",
    dash_welcome: "ברוך הבא ללוח הבקרה", dash_subtitle: "עקוב אחר חלוקת ההזמנות בזמן אמת",
    stat_total: "סה״כ", stat_delivered: "נמסר", stat_enroute: "בדרך", stat_pending: "טרם החל",
    progress_label: "אחוז חלוקה", last_deliveries: "המסירות האחרונות", arrived: "✓ הגיע",
    guests_count: "רשימת המוזמנים", guests_empty: "אין מוזמנים עדיין — התחל בהוספת המוזמן הראשון",
    guests_add_btn: "➕ הוספת מוזמן", guests_edit: "✎ עריכה", guests_delete: "מחק",
    add_title: "הוספת מוזמן חדש", edit_title: "עריכת פרטי מוזמן", add_subtitle: "הזן את פרטי המוזמן והוא יתווסף לרשימתך",
    field_name: "שם מלא *", field_phone: "מספר טלפון *",
    field_address: "כתובת", field_address_optional: "(אופציונלי)",
    field_invite_type: "סוג ההזמנה", type_premium: "✦ יוקרתי", type_vip: "♛ VIP",
    add_submit: "➕ הוסף מוזמן לרשימה", edit_save: "💾 שמור שינויים", edit_cancel: "ביטול",
    add_tip: "💡 שם מלא ומספר טלפון נדרשים. הכתובת אופציונלית — אך הוספתה מקלה על השליח לפתוח Waze ישירות לכתובת המוזמן.",
    add_required_msg: "שם ומספר טלפון נדרשים",
    add_duplicate_msg: "מוזמן זה כבר נוסף",
    add_success: "✓ המוזמן נוסף בהצלחה", edit_success: "✓ השינויים נשמרו", delete_success: "המוזמן נמחק",
    proofs_title: "הוכחות מסירה", proofs_distributor: "השליח:", proofs_pending: "הזמנות ממתינות לתמונת הוכחה בעת המסירה",
    live_title: "מיקום השליח בזמן אמת",
    live_empty_title: "השליח עדיין לא שיתף את מיקומו",
    live_empty_body: "מיקום השליח יוצג כאן ברגע שישתף את הקישור מהאפליקציה שלו — בתוך לוח הבקרה ללא צורך לצאת מהאתר",
    live_subtitle: "מיקום השליח הנוכחי מוצג ישירות ממפות Google",
    live_shared_at: "עודכן לאחרונה:", live_open_new: "פתח בחלון חדש",
    driver_title: "תוכנת השליח", driver_subtitle: "רשימת מסירה", driver_completed: "הושלם",
    driver_remaining: "נותר:", driver_done: "הושלמו:",
    driver_list_title: "רשימת מסירה מסודרת לפי יישובים וקרבה",
    driver_next: "הבא", driver_call: "התקשרות", driver_open_waze: "🗺 פתח ב-Waze",
    driver_no_address: "אין כתובת — התקשר למוזמן",
    driver_deliver_btn: "✉ מסירת ההזמנה", driver_cancel: "ביטול",
    driver_complete_form: "השלם את פרטי המסירה",
    driver_photo_label: "תמונת הוכחה", driver_photo_optional: "(אופציונלי — לחץ אם תצטרך)",
    driver_photo_done: "התמונה צולמה", driver_photo_retake: "לחץ לצילום חוזר",
    driver_photo_hint: "לחץ לפתיחת המצלמה וצילום ההוכחה",
    driver_note_label: "הערה (אופציונלי)", driver_note_placeholder: "לדוגמה: נמסר לאחיו",
    driver_confirm: "✓ אישור מסירה ועדכון החתן",
    driver_done_section: "נמסרו", driver_delivered_badge: "נמסר",
    driver_all_done_title: "סיימת את כל ההזמנות", driver_all_done_subtitle: "החתן עודכן על השלמה",
    share_section: "שיתוף המיקום שלי עם החתן",
    share_label: "קישור להודעת המיקום החי מטלגרם",
    share_placeholder: "https://t.me/your_channel/123",
    share_save: "שמור ושתף מיקום", share_stop: "הפסק שיתוף",
    share_active: "✓ המיקום שלך מוצג כעת בלוח החתן",
    share_hint: "📡 שיטת טלגרם (8 שעות מעקב אוטומטי):\n1) פתח ערוץ טלגרם ציבורי\n2) שלח את המיקום החי שלך (Live Location) שם\n3) לחץ ארוכות על ההודעה ← Copy Post Link\n4) הדבק את הקישור כאן — כל 8 שעות שתף מחדש בקישור חדש",
    share_invalid: "אנא הדבק קישור טלגרם תקין (https://t.me/...)",
    share_saved: "✓ המיקום שותף עם החתן",
    share_stopped: "שיתוף המיקום הופסק",
    open_in_telegram: "פתח את ההודעה בטלגרם",
    admin_title: "לוח המנהל", admin_subtitle: "ניהול נתוני משתמשים — גלוי למנהל בלבד",
    admin_users_count: "מספר משתמשים",
    admin_add_user: "הוספת משתמש חדש",
    admin_role: "סוג", admin_role_groom: "חתן", admin_role_driver: "שליח",
    admin_existing: "המשתמשים הקיימים", admin_create: "יצירת משתמש", admin_delete: "מחק",
    admin_no_users: "אין משתמשים", admin_added: "✓ המשתמש נוצר", admin_deleted: "המשתמש נמחק",
    admin_required: "שם משתמש וסיסמה נדרשים", admin_taken: "שם המשתמש תפוס",
    admin_warning: "אתה במצב מנהל — לוח זה גלוי לך בלבד",
    lang_label: "שפה",
    logout: "התנתקות", logout_confirm_title: "התנתקות",
    logout_confirm_body: "האם אתה בטוח שברצונך להתנתק? תצטרך להזין שוב את פרטי הכניסה.",
    logout_confirm_yes: "כן, התנתק", logout_confirm_no: "ביטול",
    driver_pick_groom_title: "למי אתה מוסר את ההזמנות?",
    driver_pick_groom_subtitle: "הזן את שם המשתמש של החתן שאתה עובד עבורו. תראה רק את רשימת המוזמנים שלו.",
    driver_pick_groom_field: "שם משתמש של החתן",
    driver_pick_groom_submit: "המשך ←",
    driver_pick_groom_invalid: "שם המשתמש לא נמצא או אינו חתן",
    driver_pick_groom_change: "החלפת חתן",
    driver_serving_for: "עובד עבור החתן:",
    tab_shared: "ערים משותפות",
    shared_title: "ערים משותפות בין חתנים",
    shared_subtitle: "חלק להזמנות מכמה חתנים באותה עיר באותה הסבבה — מסודר גיאוגרפית",
    shared_pick_grooms_label: "בחר את החתנים שברצונך לחלק עבורם",
    shared_grooms_empty: "אין חתנים רשומים עדיין",
    shared_view_btn: "הצג ערים משותפות ←",
    shared_no_cities: "אין ערים משותפות בין חתנים אלה כרגע",
    shared_no_pending: "אין הזמנות ממתינות לחתנים אלה",
    shared_back_to_grooms: "← החלף חתנים",
    shared_back_to_cities: "← בחר עיר אחרת",
    shared_pick_city: "בחר עיר להצגת מסלול החלוקה",
    shared_route_in: "מסלול חלוקה ב:",
    shared_city_count: "מכתבים",
    for_groom: "עבור החתן:",
    live_iframe_hint: "אם המפה לא מופיעה, ודא שהשליח הדביק קישור Google Maps עם קואורדינטות (כמו …@31.5,35.1,…) או קואורדינטות ישירות (31.5,35.1)",
    share_pick_grooms: "בחר את החתנים שיראו את המיקום שלך",
    share_pick_grooms_required: "יש לבחור לפחות חתן אחד",
    share_active_with: "המיקום שלך משותף עם:",
    share_no_grooms_yet: "אין חתנים במערכת עדיין",
    share_url_or_coords: "קישור Google Maps או קואורדינטות ישירות",
    share_url_placeholder: "https://maps.google.com/... או 31.5,35.1",
    no_driver_sharing: "אין שליח שמשתף איתך את מיקומו כעת",
    drivers_sharing_count: "שליחים משתפים מיקום",
    driver_label: "שליח:",
    photo_view: "צפייה בתמונה",
    photo_close: "סגירה",
    photo_no_image: "אין תמונה",
    share_use_my_location: "📍 השתמש במיקום הנוכחי שלי",
    share_hint_v2: "לחץ «השתמש במיקום הנוכחי שלי» או הדבק קישור Google Maps המכיל קואורדינטות כמו @31.5,35.1 (הקישור הקצר maps.app.goo.gl לא יעבוד)",
    name_invalid_words: "נא להזין שם מלא (לפחות שם פרטי ושם משפחה, לדוגמה: רואד חג'יר)",
    phone_invalid_digits: "מספר הטלפון חייב להכיל רק ספרות",
    phone_invalid_short: "חסרה לך",
    phone_invalid_extra: "המספר שלך עודף",
    phone_invalid_digit_label: "ספרה",
    phone_invalid_digits_label: "ספרות",
    example_name: "לדוגמה: רואד חג'יר",
    example_phone: "לדוגמה: 0524264094",
    example_address: "לדוגמה: חיפה, רחוב הנביא 86",
    addr_loading: "🔍 מחפש במפות...",
    addr_no_matches: "אין תוצאות — המשך להקליד או הזן ידנית",
    addr_powered: "תוצאות מ-OpenStreetMap",
    guests_with_address: "📍 מוזמנים עם כתובת",
    guests_without_address: "⌛ מוזמנים ללא כתובת",
    guests_without_hint: "למוזמנים אלה חסרה כתובת — הוסף כתובת לכל אחד כדי שהשליח יוכל למסור את ההזמנה",
    addr_city_field: "יישוב",
    addr_city_placeholder: "התחל להקליד שם יישוב (לדוגמה: חיפה)",
    addr_street_field: "שם רחוב / אזור",
    addr_street_placeholder: "הקלד שם רחוב (לדוגמה: רחוב הנביא 86)",
    addr_pick_city_first: "בחר יישוב תחילה",
    admin_tab_users: "משתמשים",
    admin_tab_send: "שליחת הזמנות",
    admin_tab_confirmations: "אישורים",
    admin_tab_settings: "הגדרות",
    admin_select_groom: "בחר חתן",
    admin_no_grooms: "אין חתנים במערכת עדיין",
    admin_groom_guests_count: "מספר מוזמנים:",
    admin_send_to_all: "📨 שלח לכולם",
    admin_send_to_one: "📨 שלח",
    admin_settings_title: "הגדרות הודעה",
    admin_settings_subtitle: "ההודעה והקישור שיישלחו למוזמנים ב-WhatsApp",
    admin_msg_body: "טקסט ההודעה",
    admin_msg_placeholder: "חברת דעוה מקדמת אתכם בברכה\nאנחנו חברה מתמחה במסירת הזמנות לחתונות...\n\nאנא אשרו את פרטיכם באמצעות הקישור למטה:",
    admin_form_link: "קישור לטופס האישור (יישלח בהודעה)",
    admin_form_link_placeholder: "https://example.com/confirm",
    admin_save_settings: "💾 שמור הגדרות",
    admin_settings_saved: "✓ ההגדרות נשמרו",
    admin_bulk_warn: "⚠ תיפתח חלון WhatsApp לכל מוזמן בנפרד — נדרשת הרשאה לחלונות קופצים",
    admin_send_hint: "💡 לחיצה על «שלח» פותחת חלון WhatsApp עם ההודעה מוכנה לשליחה למוזמן",
    admin_conf_title: "אישורי מוזמנים",
    admin_conf_subtitle: "הנתונים שנשלחו על ידי המוזמנים דרך טופס האישור",
    admin_conf_empty: "אין אישורים עדיין",
    admin_conf_matched: "✓ מוזמנים תואמים",
    admin_conf_unknown: "⚠ מוזמנים לא ידועים (אין מספר תואם)",
    admin_conf_from_groom: "פרטי החתן:",
    admin_conf_from_guest: "פרטי המוזמן:",
    admin_conf_edit: "✎ עריכה",
    admin_conf_use_guest_data: "השתמש בפרטי המוזמן",
    admin_conf_no_address: "ללא כתובת",
    admin_conf_for_groom: "עבור החתן:",
    conf_form_welcome_title: "חברת דעוה מקדמת אתכם בברכה",
    conf_form_welcome_body: "אנחנו חברת דעוה — מתמחים במסירת הזמנות לחתונות בצורה מקצועית ויוקרתית. נרשמתם כאחד המוזמנים הנכבדים, אנא אשרו את פרטיכם להקלת מסירת ההזמנה אליכם.",
    conf_form_full_name: "שם מלא",
    conf_form_phone: "מספר טלפון",
    conf_form_city: "יישוב",
    conf_form_street: "שם רחוב",
    conf_form_house_number: "מספר בית",
    conf_form_submit: "✓ אשר את פרטיי",
    conf_form_thanks_title: "תודה לך! ✓",
    conf_form_thanks_body: "פרטיך התקבלו. ניצור איתכם קשר בקרוב למסירת ההזמנה.",
    conf_form_invalid: "אנא מלא את כל השדות הנדרשים",
    share_geo_blocked_title: "המיקום חסום בסביבה זו",
    share_geo_blocked_body: "חלק מהדפדפנים או ממשקי תצוגה חוסמים גישה למיקום. השתמש בשיטות הידניות:",
    share_help_btn: "כיצד מקבלים קואורדינטות?",
    share_help_close: "הסתר",
    share_help_step1: "1️⃣ פתח את Google Maps בכרטיסייה חדשה",
    share_help_step2: "2️⃣ הקש ארוכות (מובייל) או קליק ימני (מחשב) על מיקומך",
    share_help_step3: "3️⃣ הקואורדינטות יופיעו (כמו 31.768, 35.214) — העתק",
    share_help_step4: "4️⃣ הדבק בשדה למטה בפורמט: 31.768,35.214",
    share_open_gmaps: "🗺 פתח את Google Maps לקבלת קואורדינטות",
    share_manual_lat: "קו רוחב (Latitude)",
    share_manual_lng: "קו אורך (Longitude)",
    share_manual_fill: "✓ השתמש בקואורדינטות אלה",
    // Geolocation-based live tracking
    geo_not_supported: "הדפדפן שלך לא תומך באיתור מיקום",
    geo_denied: "הרשאת המיקום נדחתה — אנא אפשר אותה בהגדרות הדפדפן",
    geo_requesting: "מבקש הרשאת מיקום...",
    geo_grant_btn_driver: "📍 אפשר שיתוף מיקום חי שלי",
    geo_grant_btn_groom: "📍 אפשר להציג את המיקום שלי על המפה",
    geo_retry: "↻ נסה שוב",
    geo_share_start: "📡 התחל לשדר את המיקום החי",
    geo_share_active: "✓ המיקום שלך משודר כעת לחתנים שנבחרו",
    geo_share_stop: "הפסק שידור מיקום",
    geo_pick_grooms_first: "בחר לפחות חתן אחד לפני התחלת השידור",
    geo_updating: "🔄 מתעדכן אוטומטית כל שנייה",
    geo_accuracy: "דיוק המיקום:",
    geo_meters: "מ'",
    geo_hint_new: "📡 בעזרת GPS ישיר — ללא צורך בקישורים חיצוניים:\n1) לחץ על אפשר שיתוף מיקום\n2) בחר את החתנים שיראו אותך על המפה\n3) התחל לשדר — כל מי שבחרת רואה אותך נע במפה בזמן אמת",
    map_you: "אתה",
    map_driver: "שליח",
    map_legend: "🗺 המפה החיה",
    map_no_location_yet: "לחץ על «אפשר להציג את מיקומי» כדי לראות את המפה",
    map_loading: "טוען את המפה...",
    map_drivers_count: "שליחים משדרים מיקום",
    // Confirmation status badges on guest cards
    conf_status_matched: "✓ אישור תואם",
    conf_status_mismatch: "⚠ פרטים לא תואמים",
    conf_mismatch_name: "השם שונה",
    conf_mismatch_city: "היישוב שונה",
    conf_mismatch_invalid_phone: "מספר טלפון לא תקין",
    conf_mismatch_invalid_name: "שם לא שלם",
    conf_status_hint: "המוזמן שלח אישור פרטים, אך חלק מהפרטים אינם תואמים את מה שהזין החתן",
  },
};
const makeT = (lang) => (key) => (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.ar[key] || key;

const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;900&family=Amiri:wght@400;700&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { background: #07070a; color: #f5e6b8; font-family: 'Cairo', 'Amiri', sans-serif; direction: rtl; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-thumb { background: #c9a84c44; border-radius: 4px; }
    button, input, select, textarea { font-family: inherit; direction: inherit; }
    a { text-decoration: none; color: inherit; }
    @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
    @keyframes fadeIn { from{opacity:0} to{opacity:1} }
    @keyframes slideUp { from{opacity:0;transform:translateY(36px)} to{opacity:1;transform:none} }
    @keyframes sealPop { from{transform:scale(0) rotate(-30deg);opacity:0} to{transform:scale(1) rotate(0);opacity:1} }
    @keyframes flicker { 0%,100%{opacity:1} 45%{opacity:.85} 50%{opacity:.7} 55%{opacity:.9} }
    @keyframes glowPulse { 0%,100%{box-shadow:0 0 18px rgba(201,168,76,.25)} 50%{box-shadow:0 0 28px rgba(201,168,76,.5)} }
    .fade-up { animation: fadeUp .55s ease both; }
    .fade-up-2 { animation: fadeUp .55s .1s ease both; }
    .fade-up-3 { animation: fadeUp .55s .2s ease both; }
    .fade-up-4 { animation: fadeUp .55s .32s ease both; }
    .gold-btn {
      background: linear-gradient(135deg,#c9a84c,#f0c84c);
      color: #000; border: none; border-radius: 14px;
      padding: 13px 28px; font-size: 15px; font-weight: 900;
      cursor: pointer; transition: all .2s; font-family: inherit;
    }
    .gold-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(201,168,76,.5); }
    .gold-btn:disabled { opacity: .5; cursor: not-allowed; transform: none; box-shadow: none; }
    .ghost-btn {
      background: transparent; border: 1.5px solid rgba(201,168,76,.35);
      color: #c9a84c; border-radius: 14px; padding: 12px 28px;
      font-size: 15px; font-weight: 700; cursor: pointer; transition: all .2s; font-family: inherit;
    }
    .ghost-btn:hover { background: rgba(201,168,76,.08); }
    .input-field {
      background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1);
      border-radius: 12px; padding: 12px 16px; color: #f5e6b8;
      font-size: 14px; width: 100%; outline: none; transition: border .2s; font-family: inherit;
    }
    .input-field:focus { border-color: rgba(201,168,76,.5); }
    .card {
      background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07);
      border-radius: 18px; padding: 20px;
    }
    .gold-card {
      background: linear-gradient(135deg,rgba(201,168,76,.1),rgba(201,168,76,.03));
      border: 1px solid rgba(201,168,76,.22); border-radius: 18px; padding: 20px;
    }
    .nav-tab {
      padding: 7px 15px; border-radius: 10px; font-size: 13px; font-weight: 700;
      cursor: pointer; border: none; background: transparent; transition: all .2s; font-family: inherit;
    }
    .nav-tab.active { background: rgba(201,168,76,.15); color: #c9a84c; }
    .nav-tab:not(.active) { color: #7a6a4a; }
    .nav-tab:not(.active):hover { color: #a08050; }
    .section-label {
      font-size: 11px; color: #7a6a4a; font-weight: 700;
      letter-spacing: 2px; text-transform: uppercase; margin-bottom: 10px;
    }
    .divider { height: 1px; background: rgba(201,168,76,.1); margin: 28px 0; }
    .status-badge {
      padding: 3px 10px; border-radius: 20px; font-size: 11px;
      font-weight: 700; display: inline-flex; align-items: center; gap: 4px;
    }
  `}</style>
);

/* ── SAMPLE DATA ── */
const SAMPLE_GUESTS = [
  { id:1, groomUsername:"groom", name:"أبو خالد العمري",     phone:"0521100001", area:"رام الله - البالوع",          status:"delivered", inviteType:"premium", proofImg:"📸", deliveredAt:"10:24", deliveredBy:"الموزع أحمد" },
  { id:2, groomUsername:"groom", name:"عمو سمير حمدان",      phone:"0521100002", area:"رام الله - البيرة",           status:"delivered", inviteType:"vip",     proofImg:"📸", deliveredAt:"10:48", deliveredBy:"الموزع أحمد" },
  { id:3, groomUsername:"groom", name:"صديق أحمد زيد",       phone:"0521100003", area:"نابلس - حي الياسمين",         status:"enroute",   inviteType:"premium" },
  { id:4, groomUsername:"groom", name:"المدير عصام نصار",    phone:"0521100004", area:"القدس - بيت حنينا",           status:"enroute",   inviteType:"vip" },
  { id:5, groomUsername:"groom", name:"الشيخ محمد أبو رمضان", phone:"0521100005", area:"الخليل - وسط البلد",          status:"pending",   inviteType:"premium" },
  { id:6, groomUsername:"groom", name:"ابن العم رائد",        phone:"0521100006", area:"جنين - حي النزال",            status:"pending",   inviteType:"premium" },
  { id:7, groomUsername:"groom", name:"أستاذ كريم سلامة",     phone:"0521100007", area:"طولكرم - شارع المدارس",       status:"pending",   inviteType:"vip" },
];

const STATUS = {
  pending:   { label:"لم يبدأ",    color:"#7a6a4a", bg:"rgba(122,106,74,.15)",  icon:"⌛" },
  enroute:   { label:"في الطريق",  color:"#4b9fd4", bg:"rgba(75,159,212,.15)",  icon:"🚗" },
  delivered: { label:"تم التسليم", color:"#4cc97a", bg:"rgba(76,201,122,.15)",  icon:"✓" },
};

/* ══════════════════════════════════════ */
/* BRAND LOGO — user-provided SVG (icon + with-text variants)            */
/* Source paths were black; we re-fill them with a gold gradient that    */
/* matches the website palette. Wrapper keeps the pop + glow animation.  */
/* ══════════════════════════════════════ */
const BRAND_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg"
	 viewBox="0 0 480 384">
<defs><linearGradient id="dwGoldIcon" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff3c0"/><stop offset="35%" stop-color="#f0c84c"/><stop offset="100%" stop-color="#c9a84c"/></linearGradient></defs>
<path fill="url(#dwGoldIcon)" 
	d="
M258.622375,85.332634 
	C266.523071,91.147324 274.145477,96.735588 281.956757,102.462296 
	C282.678040,101.496964 283.232483,101.051949 283.395477,100.492798 
	C286.493378,89.866699 286.766144,89.650284 297.893982,89.656036 
	C300.560455,89.657410 303.229889,89.599609 305.892761,89.703148 
	C312.131348,89.945732 314.543488,92.494736 314.180115,98.928970 
	C313.843658,104.887093 312.978210,110.730339 313.988556,116.799721 
	C315.877808,128.149170 322.407654,135.772507 331.999725,141.184067 
	C337.399017,144.230179 342.468018,147.685074 347.119415,151.761200 
	C352.548798,156.519058 353.587219,162.049469 349.971527,166.675293 
	C346.689026,170.874802 340.856506,171.253403 335.216187,167.065048 
	C312.476105,150.178818 289.845032,133.145737 267.169220,116.172928 
	C259.832733,110.681602 252.431854,105.274651 245.164627,99.693420 
	C242.461319,97.617271 239.950821,96.963097 237.051636,99.130264 
	C221.460541,110.784790 204.666809,120.886398 190.951736,134.960358 
	C173.954605,152.402252 168.928207,173.154739 174.023773,196.611282 
	C176.384811,207.479858 174.171402,213.456696 165.954910,216.964127 
	C161.352524,218.928772 159.612854,218.259109 157.922714,213.658875 
	C152.479248,198.842728 150.950226,183.608078 153.204620,167.993790 
	C153.392197,166.694656 153.994568,165.400986 152.726395,164.105881 
	C149.752594,163.682068 148.192078,166.247681 146.020752,167.581375 
	C142.143982,169.962585 138.102280,171.340759 133.865555,168.576202 
	C130.474625,166.363571 129.140244,163.089645 129.754700,159.072052 
	C130.276276,155.661850 132.589874,153.523163 135.163712,151.587875 
	C157.270599,134.965561 179.378677,118.344826 201.487366,101.724907 
	C211.476425,94.215752 221.397324,86.613419 231.480301,79.232491 
	C239.471069,73.383095 242.817688,73.546043 250.722778,79.441116 
	C253.260269,81.333420 255.803497,83.218056 258.622375,85.332634 
z"/>
<path fill="url(#dwGoldIcon)" 
	d="
M218.851959,239.806732 
	C229.058090,233.876144 239.182037,228.712219 250.551422,226.321854 
	C251.345505,229.172058 249.616394,229.976013 248.372742,230.907242 
	C236.908890,239.491379 225.475235,248.118927 213.876495,256.518036 
	C210.366821,259.059570 209.901642,261.094879 212.817871,264.511993 
	C221.145401,274.269928 229.210526,284.252075 237.358276,294.162933 
	C239.009293,296.171143 240.631851,297.702118 242.960556,294.985199 
	C262.796143,271.842651 283.444580,249.322327 297.953339,222.148193 
	C304.555664,209.782440 308.843353,196.704544 309.419830,182.692459 
	C309.762421,174.364746 308.166382,166.133194 305.480072,158.179581 
	C304.963898,156.651367 303.993195,155.165039 304.761200,153.480774 
	C306.134735,152.357025 307.356140,153.196823 308.552429,153.648605 
	C323.760986,159.392334 331.264191,174.217484 329.013611,191.120255 
	C325.544952,217.171112 312.669098,238.738052 297.990753,259.530640 
	C283.161163,280.537506 266.084137,299.700195 248.507446,318.415955 
	C242.430603,324.886597 239.265366,324.710236 233.278351,318.418823 
	C217.059860,301.375702 202.020813,283.341125 187.751007,264.652191 
	C186.751663,263.343384 185.819962,261.982941 184.546539,260.216064 
	C196.070129,253.363739 207.305878,246.682587 218.851959,239.806732 
z"/>
<path fill="url(#dwGoldIcon)" 
	d="
M196.843506,193.051239 
	C195.701019,190.228271 194.613113,187.794449 193.716217,185.292145 
	C191.505508,179.124481 192.918854,175.958374 198.889587,173.425613 
	C201.491348,172.321960 204.086868,171.203156 206.698227,170.122635 
	C214.245377,166.999817 217.955170,161.592529 216.750687,153.264404 
	C216.054840,148.452988 217.691162,145.187210 222.634506,143.849533 
	C225.871826,142.973526 228.164185,143.296951 230.115112,146.638519 
	C233.899796,153.120956 241.763123,155.602142 248.783936,152.906342 
	C254.683685,150.641006 260.478851,148.104889 266.356506,145.780090 
	C273.054504,143.130783 276.328491,144.316910 279.098694,150.917160 
	C284.762665,164.412140 290.305634,177.960983 295.666046,191.579117 
	C298.683502,199.244934 297.763367,201.730988 290.407104,205.017105 
	C267.929932,215.057877 244.995667,224.005463 222.084625,232.994843 
	C216.878937,235.037338 214.068222,233.752609 211.487411,227.897675 
	C206.457993,216.487610 201.797989,204.914703 196.843506,193.051239 
M240.185043,218.630966 
	C254.846970,212.649841 269.508911,206.668701 285.109222,200.304779 
	C279.589233,196.724411 274.380493,195.543793 269.575195,193.464111 
	C265.644928,191.763107 263.378937,192.334122 261.651154,196.820312 
	C258.314148,205.484970 251.691788,208.722733 242.510559,207.037003 
	C240.718323,206.707932 238.944946,206.253815 237.186066,205.772598 
	C235.815125,205.397537 234.420639,205.256500 233.536194,206.493881 
	C229.995819,211.446976 226.758850,216.552780 226.447220,223.321457 
	C231.463867,222.762497 235.294250,220.314224 240.185043,218.630966 
M257.871826,156.453690 
	C250.365829,158.821747 243.860062,161.912277 241.618973,170.742386 
	C240.481125,175.225677 235.959473,176.936005 231.321503,177.340393 
	C227.531342,177.670868 224.102692,176.454971 220.689804,175.106079 
	C217.223694,173.736130 213.927170,173.649506 210.782516,176.025482 
	C207.681473,178.368500 207.978241,180.341064 211.403152,181.822556 
	C214.295700,183.073761 217.337296,183.976349 220.255112,185.174011 
	C227.256683,188.047943 229.331696,187.791168 234.290939,182.257217 
	C238.611694,177.435745 243.682312,175.620483 249.946854,177.261963 
	C251.973984,177.793137 254.108566,178.158783 255.360031,176.108826 
	C259.397858,169.494690 262.902252,162.614944 265.453308,155.007385 
	C262.566467,154.621323 260.615051,155.596939 257.871826,156.453690 
M283.704254,191.489075 
	C285.084229,191.586334 286.294769,193.195450 288.169159,191.769913 
	C284.477020,179.778381 279.228424,168.391739 273.336121,155.446243 
	C269.263733,164.328064 265.722778,171.767014 262.460236,179.326141 
	C261.372986,181.845139 263.141785,183.286392 265.422485,184.178894 
	C271.308655,186.482376 277.168823,188.852158 283.704254,191.489075 
M222.623688,211.225723 
	C224.331406,207.634125 226.000839,204.023621 227.761551,200.458191 
	C228.775604,198.404770 228.880356,196.359695 226.746948,195.252075 
	C219.449646,191.463455 211.767120,188.731628 202.732101,186.908600 
	C206.160599,199.598129 211.128036,210.537704 217.044510,222.155960 
	C219.142334,218.052902 220.716858,214.973343 222.623688,211.225723 
z"/>
<path fill="url(#dwGoldIcon)" 
	d="
M140.878799,199.046509 
	C135.915207,194.291901 130.529602,194.274323 124.847519,196.460449 
	C114.885735,200.293106 108.998367,209.153503 109.334755,219.737366 
	C109.661079,230.004593 117.907051,240.559006 128.559128,243.411163 
	C141.192520,246.793839 153.254379,243.993500 164.957703,238.936859 
	C176.242157,234.061234 185.851471,226.641449 195.447281,219.156342 
	C197.664597,217.426773 199.942963,213.829880 203.367523,217.750839 
	C206.621063,221.475983 206.600494,225.147186 203.201172,228.773560 
	C202.636414,229.376053 201.977493,229.890274 200.777832,230.972183 
	C202.942825,230.811249 204.415665,230.588516 205.883698,230.616592 
	C208.791336,230.672180 210.392395,232.499390 211.265991,235.041885 
	C212.106812,237.488998 210.987244,239.294525 208.998703,240.563904 
	C187.470154,254.306473 164.661667,264.708221 138.452820,263.113831 
	C120.346046,262.012299 101.460388,251.091690 97.119720,230.706314 
	C93.537415,213.882523 100.134651,197.554123 114.594666,189.766052 
	C121.846527,185.860245 129.530624,185.188309 137.282257,187.855789 
	C144.593445,190.371704 148.452072,197.605698 146.313797,204.382233 
	C143.647964,203.595932 142.969757,200.813385 140.878799,199.046509 
z"/>
<path fill="url(#dwGoldIcon)" 
	d="
M216.598434,335.582245 
	C207.931488,334.302429 199.367447,334.364777 191.501358,329.316467 
	C193.914505,327.027802 196.851303,327.530548 198.554184,325.492798 
	C200.714523,322.907623 198.634247,321.287018 197.399490,319.472015 
	C199.056091,316.651398 201.872025,316.386536 204.396255,315.978882 
	C209.317856,315.184082 214.294846,314.727600 219.252457,314.162292 
	C222.258743,313.819519 224.808701,314.737396 226.934799,316.941010 
	C228.668640,318.738007 230.399689,320.564728 232.321426,322.148346 
	C238.041779,326.862152 243.234695,326.930084 249.087860,322.466339 
	C253.256622,319.287201 256.581696,314.861176 262.589661,314.644073 
	C272.938141,314.270142 282.802551,316.141846 292.200592,320.408997 
	C294.307068,321.365479 295.460907,323.191406 295.242828,325.676392 
	C295.016632,328.253693 293.160919,329.321869 291.112610,330.187714 
	C283.049316,333.596222 274.547577,335.301575 265.887268,335.755829 
	C249.616013,336.609375 233.321136,337.792236 216.598434,335.582245 
z"/>
<path fill="url(#dwGoldIcon)" 
	d="
M187.042816,204.993759 
	C187.902542,204.168030 188.497299,203.586639 189.083130,202.996368 
	C191.039017,201.025650 192.767563,198.190659 196.049240,201.062988 
	C199.433655,204.025223 200.389572,208.608582 197.439240,211.151764 
	C181.812469,224.621857 165.307068,236.690125 143.972092,239.191391 
	C131.459198,240.658371 120.217552,233.305435 118.187248,222.950180 
	C117.160034,217.711029 119.212585,213.164719 123.578156,211.032623 
	C124.711838,212.083832 124.221535,213.523834 124.447121,214.783539 
	C126.620476,226.919144 134.410599,232.052856 146.502121,229.207138 
	C158.421921,226.401825 168.692642,220.422623 177.997513,212.630966 
	C180.930801,210.174728 183.848770,207.700180 187.042816,204.993759 
z"/>
<path fill="url(#dwGoldIcon)" 
	d="
M281.886353,142.156052 
	C270.062592,134.949799 258.047852,128.734390 247.081802,120.850060 
	C242.748108,117.734238 238.961044,118.111900 234.689545,120.796440 
	C222.849945,128.237366 210.910049,135.519180 198.981491,142.817627 
	C197.209061,143.902084 195.601944,145.683746 193.067856,144.824081 
	C191.658875,142.578812 193.410629,141.495285 194.781647,140.377380 
	C208.202667,129.434082 221.671371,118.549103 235.063339,107.570457 
	C238.943542,104.389511 242.514206,103.840439 246.644333,107.288757 
	C260.191162,118.599258 273.874176,129.746658 287.495514,140.968018 
	C288.770752,142.018555 290.002197,143.137238 289.798645,145.322433 
	C286.499481,146.020020 284.642273,143.377151 281.886353,142.156052 
z"/>
<path fill="url(#dwGoldIcon)" 
	d="
M152.949249,277.298553 
	C137.781311,279.387238 124.112831,276.946960 111.987976,267.828735 
	C106.617485,263.789948 101.556496,256.659515 99.850403,249.166763 
	C122.323624,272.475830 148.293640,271.687988 175.625183,264.278687 
	C170.807648,273.564636 161.928345,275.128143 152.949249,277.298553 
z"/>
<path fill="url(#dwGoldIcon)" 
	d="
M249.682007,139.527908 
	C249.939590,144.110062 245.724731,149.767441 242.300156,150.044983 
	C239.319489,150.286560 235.024460,145.737656 234.719299,142.043762 
	C234.462036,138.929581 235.594162,136.694504 238.923035,136.585739 
	C242.627823,136.464691 246.593796,135.792236 249.682007,139.527908 
z"/>
</svg>`;
const BRAND_FULL_SVG = `<svg xmlns="http://www.w3.org/2000/svg"
	 viewBox="0 0 592 512">
<defs><linearGradient id="dwGoldFull" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff3c0"/><stop offset="35%" stop-color="#f0c84c"/><stop offset="100%" stop-color="#c9a84c"/></linearGradient></defs>
<path fill="url(#dwGoldFull)" 
	d="
M290.750793,46.672501 
	C299.924347,40.363121 302.460999,40.362370 311.117188,46.719040 
	C320.110107,53.322952 329.094086,59.940590 337.995697,66.666359 
	C340.861633,68.831772 342.588776,69.466072 343.970062,65.109718 
	C346.434479,57.337463 347.660339,56.695168 355.836273,56.660137 
	C359.000824,56.646580 362.166656,56.611233 365.329834,56.680538 
	C372.209747,56.831280 374.639374,59.328247 374.163635,66.316307 
	C373.746582,72.442688 372.884949,78.460884 374.163666,84.664467 
	C376.097168,94.044868 380.919373,101.263206 388.956299,106.228584 
	C395.479156,110.258545 402.129913,114.087463 407.779724,119.323799 
	C410.955170,122.266869 413.024017,125.748787 411.592651,130.419266 
	C410.368835,134.412491 407.587280,136.452591 403.635376,136.988235 
	C399.843018,137.502243 396.936707,135.397446 394.128693,133.300644 
	C365.176208,111.681183 336.232819,90.049538 307.309998,68.390457 
	C300.897095,63.588127 300.570312,63.408398 294.357422,68.060081 
	C279.979858,78.824783 264.558075,88.243370 251.791672,101.092514 
	C234.250885,118.747025 228.704803,139.766342 234.115219,163.857239 
	C236.492142,174.440933 233.839554,180.782471 225.761765,184.114136 
	C221.866882,185.720581 219.575882,184.883575 218.051895,180.834488 
	C212.481522,166.034378 211.013504,150.829239 213.077698,135.217438 
	C213.185760,134.400208 213.302444,133.579590 213.325668,132.758026 
	C213.333969,132.464417 213.077164,132.163300 212.896500,131.767258 
	C210.438828,130.500092 208.921143,132.353073 207.294510,133.643463 
	C204.462173,135.890320 201.326797,137.475372 197.677765,136.999664 
	C193.939926,136.512360 191.116287,134.338837 190.038132,130.657700 
	C188.799759,126.429634 190.035294,122.653854 193.502304,119.932358 
	C200.705139,114.278358 207.993195,108.730743 215.314041,103.229637 
	C240.342468,84.422516 265.400269,65.654465 290.750793,46.672501 
z"/>
<path fill="url(#dwGoldFull)" 
	d="
M180.053925,344.001678 
	C193.850571,362.529022 193.760422,382.673462 187.777313,403.259003 
	C181.594635,424.531219 162.774292,438.631714 140.654083,440.482635 
	C126.835793,441.638916 113.043747,440.920715 99.244255,441.249695 
	C92.706184,441.405609 90.684975,439.191193 90.677986,432.515656 
	C90.647316,403.217499 90.676689,373.919312 90.658318,344.621124 
	C90.652000,334.546997 89.456207,332.809692 79.949684,329.457092 
	C77.977936,328.761719 76.686974,327.898193 76.760590,325.675873 
	C76.843887,323.161041 78.546516,322.310028 80.665703,321.917297 
	C81.153236,321.826935 81.659958,321.801605 82.157143,321.807343 
	C101.935257,322.037140 121.776131,320.532806 141.451569,323.690002 
	C156.441818,326.095398 170.084381,331.206451 180.053925,344.001678 
M167.547958,395.977539 
	C168.937805,389.581543 168.850845,383.099579 168.747437,376.606384 
	C168.314880,349.445618 148.285141,331.039001 122.763588,332.197327 
	C112.797440,332.649628 110.322517,335.006897 111.046013,344.737518 
	C111.119934,345.731781 111.082718,346.735016 111.081924,347.734070 
	C111.062668,372.052734 111.031235,396.371429 111.026100,420.690094 
	C111.024391,428.778473 111.173065,428.921112 118.986671,430.300873 
	C137.039749,433.488770 152.399414,426.393433 161.791183,410.646912 
	C164.385086,406.297852 165.784409,401.518433 167.547958,395.977539 
z"/>
<path fill="url(#dwGoldFull)" 
	d="
M280.953308,272.030365 
	C268.299591,257.424316 256.000427,242.988190 244.283524,226.734818 
	C266.946777,215.972443 285.813385,198.766830 310.918640,193.202988 
	C311.398956,196.220947 309.594421,197.061966 308.180908,198.114960 
	C296.698608,206.668411 285.232239,215.243790 273.692078,223.718613 
	C270.780762,225.856613 269.692841,227.811966 272.402466,231.023865 
	C280.886017,241.079956 289.233734,251.251495 297.557831,261.440613 
	C299.506653,263.826050 301.211243,263.973511 303.225098,261.639496 
	C324.107574,237.437088 345.817230,213.849167 360.062561,184.739685 
	C369.687866,165.070908 372.310242,144.857941 364.905731,123.833366 
	C364.534088,122.778175 363.977386,121.648994 364.955139,120.167114 
	C368.599426,119.868172 371.762817,121.677650 374.692749,123.677658 
	C387.050598,132.113205 390.872589,143.931351 388.946869,158.466843 
	C385.478210,184.648041 372.392548,206.331284 357.514740,227.185608 
	C342.785614,247.831543 325.922241,266.722260 308.683105,285.274200 
	C302.565674,291.857483 299.559326,291.853668 293.443726,285.462891 
	C289.298645,281.131378 285.269623,276.688721 280.953308,272.030365 
z"/>
<path fill="url(#dwGoldFull)" 
	d="
M347.002899,370.176758 
	C352.277252,382.204132 356.021942,394.488953 362.704651,407.206909 
	C368.502380,395.378937 374.786896,385.144196 374.640442,372.769318 
	C374.569214,366.746246 369.457886,363.828979 364.934631,360.929260 
	C362.917572,359.636108 359.758972,359.068115 360.689789,355.708771 
	C361.572815,352.521820 364.573883,353.120117 366.999542,353.054840 
	C380.387909,352.694366 390.070496,358.156830 395.244415,370.903931 
	C399.501892,381.393066 403.919037,391.817810 408.326569,402.245209 
	C409.013000,403.869263 409.182251,405.841736 411.028473,406.959198 
	C413.061218,405.912292 413.151428,403.710724 413.834656,401.968567 
	C419.182861,388.331360 424.438049,374.657654 429.707886,360.989807 
	C430.979126,357.692719 432.863983,355.140930 436.711060,354.709259 
	C442.002014,354.115509 443.904633,356.429138 442.018158,361.403778 
	C435.348450,378.991730 428.630432,396.561340 421.917877,414.132965 
	C419.066833,421.596222 416.160522,429.038422 413.327545,436.508484 
	C412.221191,439.425690 410.971893,442.171356 407.276550,442.234497 
	C403.518860,442.298737 402.258179,439.422424 401.128876,436.599365 
	C395.997375,423.771881 390.956299,410.908051 385.778717,398.099335 
	C384.994995,396.160461 384.404205,394.015076 382.470276,392.285248 
	C377.453949,402.272736 374.177551,412.745636 370.170654,422.917145 
	C368.462219,427.253937 366.867523,431.635498 365.159393,435.972412 
	C363.913422,439.135986 362.539642,442.371307 358.371460,442.238373 
	C354.466614,442.113831 353.327637,438.953339 352.153259,435.959625 
	C344.553833,416.587128 336.924042,397.226501 329.364197,377.838562 
	C326.598297,370.745239 323.493713,363.998871 316.057678,360.479431 
	C314.449463,359.718262 313.643280,358.212280 313.777618,356.356079 
	C313.953918,353.920227 316.000763,353.673187 317.707275,353.189362 
	C325.950592,350.852264 338.184113,355.692047 343.178131,363.303558 
	C344.544830,365.386658 345.635773,367.650726 347.002899,370.176758 
z"/>
<path fill="url(#dwGoldFull)" 
	d="
M338.536377,116.563171 
	C344.271240,130.466095 349.863403,144.010971 355.367554,157.591522 
	C358.872101,166.238373 358.108704,168.826904 349.639648,172.393753 
	C327.547119,181.698288 305.342865,190.740540 283.117096,199.723953 
	C277.152283,202.134857 274.099640,201.042007 271.478271,195.000214 
	C265.184998,180.495346 259.205292,165.849365 253.383987,151.147507 
	C251.303436,145.892990 253.148621,142.705154 258.444550,140.555939 
	C260.758789,139.616760 263.074188,138.680084 265.379761,137.720032 
	C273.450287,134.359451 277.978821,128.999786 276.825500,119.568146 
	C276.119598,113.795197 278.116455,111.891380 283.725830,110.538170 
	C286.344971,109.906326 288.100861,110.515266 289.661194,112.814743 
	C295.032745,120.730804 301.448395,122.710632 310.330536,119.273483 
	C315.920929,117.110153 321.399506,114.655983 327.002319,112.527145 
	C332.600067,110.400208 335.017639,111.285309 338.536377,116.563171 
M301.575378,184.959885 
	C315.692596,179.243256 329.809784,173.526627 344.903015,167.414780 
	C339.281219,163.753311 333.965698,162.387329 328.978149,160.284943 
	C325.172089,158.680588 323.328217,159.769272 321.806671,163.563919 
	C318.124451,172.747147 311.570190,175.920090 301.782440,173.839462 
	C300.156647,173.493881 298.510864,173.239807 296.890747,172.871170 
	C295.703766,172.601059 294.423065,172.362579 293.654602,173.441940 
	C290.114685,178.414032 287.073639,183.618683 286.078247,191.175278 
	C291.747314,188.905731 296.305328,187.080994 301.575378,184.959885 
M272.380707,149.252151 
	C275.185577,150.291107 278.100433,151.106049 280.771667,152.417236 
	C285.808319,154.889496 290.054504,154.338043 293.671021,149.903351 
	C298.097076,144.475952 303.586273,142.326492 310.505951,144.411835 
	C313.078491,145.187119 315.049957,144.283234 316.279236,141.813049 
	C318.206726,137.939804 320.271210,134.132141 322.105255,130.215942 
	C323.259613,127.751053 325.043701,125.396500 324.360657,121.471565 
	C315.800842,125.071625 305.632111,124.801559 302.475189,136.272537 
	C300.938873,141.854980 296.307343,144.168533 290.558960,144.358383 
	C286.936707,144.478012 283.720764,143.255234 280.432831,142.045929 
	C275.028168,140.058105 271.762360,141.191422 268.606232,145.973648 
	C268.993744,147.638000 270.485687,148.151520 272.380707,149.252151 
M343.541901,145.882797 
	C340.251831,138.675766 337.819031,131.066910 333.308563,123.356628 
	C329.065796,131.393066 325.394897,138.785568 322.459045,146.529892 
	C321.787964,148.300095 322.430847,149.866547 324.289429,150.616867 
	C331.953400,153.710907 339.633850,156.764114 348.178864,160.180405 
	C347.372406,154.714615 345.382568,150.720917 343.541901,145.882797 
M287.971588,166.765427 
	C289.052155,164.685196 288.164429,163.028687 286.412720,162.141632 
	C279.199188,158.488708 271.654175,155.757248 262.789490,153.840195 
	C266.078491,166.614670 271.325867,177.409668 277.024414,189.462036 
	C281.051666,181.143417 284.374115,174.280655 287.971588,166.765427 
M294.827423,133.716370 
	C291.944794,133.753647 289.702209,134.893204 287.627075,137.974945 
	C291.611542,138.389282 294.533325,138.499237 294.827423,133.716370 
M284.260376,127.021095 
	C287.618683,130.858551 288.955780,126.640282 291.386566,125.604012 
	C288.201782,123.170235 288.201782,123.170235 284.260376,127.021095 
z"/>
<path fill="url(#dwGoldFull)" 
	d="
M146.000000,466.986725 
	C266.963684,466.989685 387.427338,466.990417 507.891022,467.011230 
	C510.381226,467.011658 512.883423,467.132385 515.358215,467.399384 
	C517.876160,467.671051 519.250000,469.195129 519.129944,471.791016 
	C519.011353,474.356964 517.196838,475.101715 515.030518,475.238983 
	C509.383179,475.596802 503.731964,476.172943 498.082275,476.173218 
	C366.622070,476.179596 235.161835,476.122620 103.701630,476.061493 
	C101.041435,476.060272 98.373962,475.959412 95.723274,475.741882 
	C93.099831,475.526581 91.259430,474.245117 91.290695,471.354309 
	C91.319908,468.654022 93.165092,467.607971 95.538315,467.352356 
	C97.520103,467.138916 99.520958,467.009491 101.513695,467.005524 
	C116.175751,466.976318 130.837891,466.987976 146.000000,466.986725 
z"/>
<path fill="url(#dwGoldFull)" 
	d="
M272.273773,417.999695 
	C272.272919,423.664001 272.234772,428.828796 272.287079,433.992645 
	C272.315491,436.795776 272.072388,439.453369 268.988098,440.588013 
	C265.889526,441.727966 262.495087,442.212433 260.119049,439.542084 
	C256.130219,435.059235 252.156921,435.767090 247.692902,438.501495 
	C238.525116,444.117126 228.782349,444.357483 218.860672,441.008545 
	C207.418411,437.146301 201.654877,428.649445 201.736847,416.251556 
	C201.809723,405.230988 207.631424,397.675201 218.817688,393.662689 
	C227.546356,390.531769 236.648865,389.797424 245.753845,388.895508 
	C251.388855,388.337250 252.126266,387.260529 251.754929,381.532104 
	C251.557602,378.488098 250.640335,375.639679 249.539185,372.862122 
	C246.858337,366.099854 242.446777,363.279816 234.817642,363.247284 
	C227.091782,363.214325 222.905228,365.855804 220.120483,372.727753 
	C218.552292,376.597626 216.198608,378.635040 211.692291,377.816132 
	C207.486923,377.051880 206.155518,374.945496 206.945435,370.819946 
	C209.035110,359.905731 214.614594,355.269714 228.889801,352.735168 
	C234.688782,351.705597 240.413116,351.656036 246.231049,352.752258 
	C261.163208,355.565765 270.442688,366.498413 271.373199,382.058075 
	C272.079529,393.869354 272.318054,405.677185 272.273773,417.999695 
M241.104767,429.680023 
	C250.432388,426.389191 256.081085,412.528534 251.768051,403.652710 
	C249.945389,399.901855 246.857529,398.836884 243.066925,399.457733 
	C238.441513,400.215332 234.007507,401.696503 229.936020,404.036407 
	C223.178497,407.920013 220.654480,414.764465 223.367218,421.444641 
	C226.297211,428.659790 232.388733,431.661591 241.104767,429.680023 
z"/>
<path fill="url(#dwGoldFull)" 
	d="
M499.116364,436.409943 
	C487.593689,443.831573 475.705322,444.794312 463.607697,439.464294 
	C453.610687,435.059784 449.638275,426.385742 449.813660,415.964722 
	C449.980164,406.072601 455.056061,399.012817 464.125824,394.930817 
	C473.557861,390.685822 483.567566,389.145874 493.788300,389.089111 
	C498.734100,389.061615 500.106171,386.841858 499.921539,382.302399 
	C499.285858,366.672638 486.499603,358.362061 474.095978,365.620544 
	C471.221039,367.302948 469.410645,369.704041 468.177002,372.762024 
	C466.093689,377.926178 463.650024,379.151093 459.021271,377.817719 
	C454.075195,376.392883 454.741577,373.035736 455.411713,369.070709 
	C457.388092,357.376801 466.819672,355.320953 475.859680,352.963135 
	C481.867523,351.396118 488.052002,351.651459 494.176880,352.959869 
	C511.504150,356.661407 519.126343,366.094482 519.980103,386.893127 
	C520.635681,402.865143 520.206787,418.881805 520.250916,434.878632 
	C520.258240,437.538757 519.684448,440.002625 516.765564,440.836914 
	C512.998779,441.913574 509.507355,441.422668 506.706512,438.328827 
	C504.721375,436.135986 502.919678,433.192108 499.116364,436.409943 
M474.847778,406.378632 
	C466.605011,413.228180 470.952881,428.647614 481.116089,430.616913 
	C490.513214,432.437805 498.257935,427.202667 500.225311,417.783417 
	C501.141846,413.395355 499.849579,409.186798 499.728729,404.890472 
	C499.614502,400.829468 496.928772,399.156036 493.410400,399.513428 
	C486.947327,400.169983 480.525940,401.320679 474.847778,406.378632 
z"/>
<path fill="url(#dwGoldFull)" 
	d="
M172.960846,173.052826 
	C162.298904,190.332321 176.884689,211.025589 195.867569,211.763367 
	C214.822876,212.500076 230.395111,204.547424 245.156113,194.055084 
	C248.955017,191.354767 252.540588,188.353561 256.213165,185.476547 
	C258.452240,183.722519 260.725586,181.307983 263.381714,184.670853 
	C265.765930,187.689468 267.350647,191.047287 264.247986,194.565720 
	C263.284424,195.658417 261.885223,196.366943 261.351349,198.069412 
	C262.909088,197.911560 264.473053,197.578583 266.023224,197.633575 
	C268.936707,197.736984 270.458771,199.703735 271.271820,202.237259 
	C271.974609,204.427109 271.122620,206.125122 269.221130,207.361603 
	C248.051590,221.127487 225.513733,231.070679 199.663559,230.182190 
	C181.197281,229.547485 161.494980,217.817230 157.138885,197.819275 
	C152.925262,178.475327 162.559479,159.550232 180.523590,154.501221 
	C187.748688,152.470505 195.072174,152.437256 201.542984,157.203934 
	C206.478119,160.839371 208.370163,166.472351 206.503983,171.387543 
	C204.670975,171.443359 204.067108,169.863022 203.123932,168.784653 
	C196.194260,160.861710 188.980911,159.881546 180.269089,165.808441 
	C177.505035,167.688889 174.980026,169.871704 172.960846,173.052826 
z"/>
<path fill="url(#dwGoldFull)" 
	d="
M278.937500,281.035767 
	C282.468658,280.624908 284.795135,282.043427 286.893585,284.147003 
	C288.773132,286.031097 290.644775,287.957062 292.733002,289.592499 
	C298.397339,294.028656 303.395721,294.002625 309.080261,289.547058 
	C313.222015,286.300690 316.619110,281.880066 322.569641,281.704987 
	C332.533508,281.411835 342.161377,282.841003 351.162964,287.310089 
	C353.289948,288.366028 355.082825,290.072449 354.980194,292.736359 
	C354.870026,295.596771 352.465637,296.335632 350.323090,297.312378 
	C341.838226,301.180298 332.703156,302.639526 323.619568,302.989471 
	C302.693085,303.795715 281.681305,304.824432 260.980194,300.193115 
	C257.916779,299.507721 254.924927,298.410248 251.989868,297.271759 
	C249.470978,296.294739 246.924515,294.949432 246.945740,291.758484 
	C246.965668,288.760590 249.537704,287.712585 251.790115,286.636627 
	C258.352295,283.501831 265.432922,282.499420 272.558838,281.713928 
	C274.542999,281.495209 276.528137,281.285461 278.937500,281.035767 
z"/>
<path fill="url(#dwGoldFull)" 
	d="
M253.147171,166.929962 
	C259.598480,170.051331 261.179901,175.274582 256.655182,179.000870 
	C243.139328,190.131744 229.193695,200.625153 211.656525,204.847595 
	C201.083450,207.393280 191.157700,206.983826 182.802032,198.982773 
	C176.047638,192.514999 176.300232,182.458588 183.266434,177.945145 
	C184.881287,178.682327 184.191788,180.220337 184.394363,181.413773 
	C186.551773,194.123672 194.424133,199.208633 207.057022,196.098007 
	C221.386841,192.569534 232.923615,184.297821 243.792526,174.789383 
	C246.777679,172.177872 249.226120,168.938507 253.147171,166.929962 
z"/>
<path fill="url(#dwGoldFull)" 
	d="
M349.409119,112.219849 
	C347.481598,112.857559 346.279785,111.804176 345.033020,111.045776 
	C332.660797,103.519806 319.723236,96.894264 307.941711,88.441124 
	C302.961304,84.867729 298.742493,85.134079 293.805420,88.289749 
	C282.305634,95.640205 270.622589,102.704063 259.005219,109.870201 
	C257.214996,110.974495 255.554428,112.529907 253.198715,112.016899 
	C251.725052,109.625168 253.372498,108.523399 254.780319,107.374420 
	C268.066498,96.531281 281.316559,85.643196 294.673828,74.888245 
	C300.132874,70.492737 301.952362,70.496262 307.352448,74.895882 
	C320.774811,85.831535 334.098022,96.889015 347.434631,107.929512 
	C348.671967,108.953819 350.206451,109.942078 349.409119,112.219849 
z"/>
<path fill="url(#dwGoldFull)" 
	d="
M304.710144,355.575500 
	C301.938965,360.153259 298.011780,362.954590 293.967926,365.628510 
	C291.871338,367.014832 289.715485,367.889832 287.791656,365.466064 
	C285.903351,363.087097 286.458740,360.762329 288.474426,358.772827 
	C290.846832,356.431244 293.276459,354.168732 294.921112,351.202698 
	C297.759460,346.083710 297.426361,344.610443 292.353058,341.666748 
	C289.083069,339.769379 286.241638,337.643921 285.696564,333.523224 
	C284.873688,327.302277 286.915710,323.025757 291.695892,321.163971 
	C297.678070,318.834045 303.836304,320.491913 307.231079,325.520264 
	C311.044098,331.168060 311.013611,337.426361 309.652374,343.768036 
	C308.773010,347.864777 306.927246,351.613251 304.710144,355.575500 
z"/>
<path fill="url(#dwGoldFull)" 
	d="
M173.374893,235.711487 
	C167.138916,231.000443 162.614120,225.438324 160.356964,217.820618 
	C170.652130,226.698639 181.836060,233.735458 195.511795,235.355316 
	C209.016052,236.954849 222.212219,234.673538 236.579803,230.390839 
	C233.998795,236.076157 230.402420,238.645401 226.382156,240.254105 
	C208.147629,247.550629 190.432388,247.152496 173.374893,235.711487 
z"/>
<path fill="url(#dwGoldFull)" 
	d="
M294.871155,106.413635 
	C297.891113,103.082626 305.621490,102.500732 308.552948,105.056114 
	C310.434570,106.696358 310.923950,108.862984 309.467682,110.854660 
	C307.367889,113.726463 305.489410,117.424210 301.110107,116.911514 
	C297.535095,116.492966 294.856445,111.842094 294.871155,106.413635 
z"/>
</svg>`;

function BrandLogo({ size = 80, withText = false }) {
  // The icon-only logo is wider than it is tall (5:4); the with-text variant
  // is roughly 1.16:1. We size by HEIGHT and let width follow the aspect ratio.
  const aspect = withText ? 592 / 512 : 480 / 384;
  const w = Math.round(size * aspect);
  const h = size;
  return (
    <div style={{
      width: w, height: h, position: "relative",
      animation: "sealPop .6s cubic-bezier(.17,.67,.35,1.4) both",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    }}>
      {/* Soft gold aura behind the logo */}
      <div style={{
        position: "absolute", inset: -6, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(201,168,76,.22) 0%, transparent 70%)",
        animation: "glowPulse 2.8s ease-in-out infinite",
        pointerEvents: "none",
      }}/>
      <div
        style={{ width: "100%", height: "100%", position: "relative", display: "flex" }}
        dangerouslySetInnerHTML={{ __html: withText ? BRAND_FULL_SVG : BRAND_ICON_SVG }}
      />
    </div>
  );
}

/* ══════════════════════════════════════ */
/* INVITATION CONTENT CONFIGS */
/* ══════════════════════════════════════ */
const INVITE_CONTENT_AR = {
  premium: {
    label: "المكتوب الفاخر",
    icon: "✦",
    tagline: "يُشرّفنا أن نتشرف بحضوركم",
    line2: "يتشرف العريس [اسم العريس] بدعوتكم",
    line3: "لحضور حفل زفافه على الآنسة [اسم العروس]",
    line4: "وذلك بتاريخ [التاريخ] — الساعة [الوقت]",
    line5: "في قاعة [اسم القاعة]، [المدينة]",
    closing: "نسعد بتشريفكم وحضوركم الكريم",
    features: [
      "تصميم مخصص بالاسم",
      "طباعة مكتوب فخم ومشوّق",
      "توزيع سريع باليد بزي رسمي",
      "صورة إثبات التسليم",
      "تتبع حي في الداشبورد",
    ],
  },
  vip: {
    label: "المكتوب الملكي VIP",
    icon: "♛",
    tagline: "لأنّ فرحك يستحق الأفضل دائماً",
    line2: "يُتشرف بدعوتكم الكريمة السيد [اسم العريس]",
    line3: "لتشريف حفل زفافه السعيد على الآنسة [اسم العروس]",
    line4: "في تمام الساعة [الوقت] من يوم [التاريخ]",
    line5: "قاعة الأفراح الملكية — [اسم القاعة]، [المدينة]",
    closing: "يسعدنا احتضان بهجتكم في هذه المناسبة العزيزة",
    note: "مقعد محجوز لكم · يُرجى إبراز هذه الدعوة",
    features: [
      "تصميم مخصص بالاسم",
      "مكتوب ملكي VIP ورهيب",
      "توزيع سريع باليد بزي رسمي",
      "صورة إثبات التسليم",
      "تتبع حي في الداشبورد",
      "رسالة ترحيبية مميزة",
      "هدية رمزية مع كل مكتوب",
    ],
  },
};

const INVITE_CONTENT_HE = {
  premium: {
    label: "המכתב היוקרתי",
    icon: "✦",
    tagline: "מתכבדים לארח אתכם",
    line2: "החתן [שם החתן] מתכבד להזמינכם",
    line3: "להשתתף בחתונתו עם הגב' [שם הכלה]",
    line4: "בתאריך [התאריך] — בשעה [השעה]",
    line5: "באולם [שם האולם], [העיר]",
    closing: "נשמח לכבודכם ולנוכחותכם",
    features: [
      "עיצוב מותאם אישית עם השם",
      "הדפסת מכתב יוקרתית ומסקרנת",
      "חלוקה מהירה במסירה ידנית במדים רשמיים",
      "תמונת הוכחה לכל מסירה",
      "מעקב חי בלוח הבקרה",
    ],
  },
  vip: {
    label: "המכתב המלכותי VIP",
    icon: "♛",
    tagline: "כי החתונה שלך ראויה לטוב ביותר תמיד",
    line2: "מתכבד להזמינכם בכבוד מר [שם החתן]",
    line3: "להשתתף בחתונתו המאושרת עם הגב' [שם הכלה]",
    line4: "בשעה [השעה] ביום [התאריך]",
    line5: "אולם החתונות המלכותי — [שם האולם], [העיר]",
    closing: "נשמח לחבק את שמחתכם באירוע יקר זה",
    note: "מקום שמור עבורכם · נא להציג הזמנה זו",
    features: [
      "עיצוב מותאם אישית עם השם",
      "מכתב מלכותי VIP ומרהיב",
      "חלוקה מהירה במסירה ידנית במדים רשמיים",
      "תמונת הוכחה לכל מסירה",
      "מעקב חי בלוח הבקרה",
      "מסר ברכה מיוחד",
      "מתנה סמלית עם כל מכתב",
    ],
  },
};

const getInviteContent = (lang) => lang === "he" ? INVITE_CONTENT_HE : INVITE_CONTENT_AR;

/* ══════════════════════════════════════ */
/* LEAFLET LOADER — injects Leaflet's CSS+JS from CDN on first use      */
/* Returns true once window.L is ready                                  */
/* ══════════════════════════════════════ */
function useLeaflet() {
  const [ready, setReady] = useState(() =>
    typeof window !== "undefined" && !!window.L
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.L) { setReady(true); return; }

    // Inject CSS once
    if (!document.querySelector("link[data-dawa-leaflet]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.setAttribute("data-dawa-leaflet", "");
      link.crossOrigin = "";
      document.head.appendChild(link);
    }

    // Inject JS once
    const existing = document.querySelector("script[data-dawa-leaflet]");
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.setAttribute("data-dawa-leaflet", "");
      script.crossOrigin = "";
      script.onload = () => setReady(true);
      script.onerror = () => setReady(false);
      document.head.appendChild(script);
    } else {
      // Script tag is there — poll until window.L is defined
      const interval = setInterval(() => {
        if (window.L) { setReady(true); clearInterval(interval); }
      }, 100);
      return () => clearInterval(interval);
    }
  }, []);

  return ready;
}

/* ══════════════════════════════════════ */
/* LIVE MAP — Leaflet-based map with multiple markers                   */
/* markers: [{ key, lat, lng, label, kind: "you" | "driver" }]          */
/* Re-renders markers smoothly without re-creating the map              */
/* ══════════════════════════════════════ */
function LiveMap({ markers, t, lang, height = 420 }) {
  const leafletReady = useLeaflet();
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const markerObjsRef = useRef(new Map()); // key -> L.marker
  const didFitRef     = useRef(false);

  // Build marker icon HTML for a given kind. Re-used across renders.
  const buildIcon = (kind, label) => {
    const L = window.L;
    if (!L) return null;
    const isYou = kind === "you";
    const bg     = isYou ? "linear-gradient(135deg,#c9a84c,#f0c84c)" : "linear-gradient(135deg,#4b9fd4,#3a7fb0)";
    const ring   = isYou ? "#c9a84c" : "#4b9fd4";
    const icon   = isYou ? "👤" : "🚗";
    const html = `
      <div style="position:relative;width:44px;height:54px;display:flex;flex-direction:column;align-items:center;">
        <div style="
          width:38px;height:38px;border-radius:50%;
          background:${bg};border:2.5px solid #fff;
          box-shadow:0 0 0 3px ${ring}55, 0 4px 14px rgba(0,0,0,.45);
          display:flex;align-items:center;justify-content:center;
          font-size:20px;line-height:1;
        ">${icon}</div>
        <div style="
          width:0;height:0;margin-top:-3px;
          border-left:6px solid transparent;border-right:6px solid transparent;
          border-top:9px solid #fff;
          filter:drop-shadow(0 2px 2px rgba(0,0,0,.35));
        "></div>
        <div style="
          margin-top:2px;padding:2px 7px;border-radius:8px;
          background:rgba(7,7,10,.86);border:1px solid ${ring}66;
          color:#f5e6b8;font-size:10px;font-weight:800;
          white-space:nowrap;font-family:'Cairo','Amiri',sans-serif;
        ">${label}</div>
      </div>`;
    return L.divIcon({
      html, className: "dawa-live-marker",
      iconSize:   [44, 80],
      iconAnchor: [22, 47], // tip of the chevron
      popupAnchor: [0, -46],
    });
  };

  // Initialise the map ONCE (when Leaflet is ready and we have at least one marker
  // or the container is mounted).
  useEffect(() => {
    if (!leafletReady || !containerRef.current || mapRef.current) return;
    const L = window.L;
    // Default centre: roughly Haifa, fallback when no markers yet.
    const fallback = [32.79, 35.0];
    const start = markers.length > 0 ? [markers[0].lat, markers[0].lng] : fallback;
    const map = L.map(containerRef.current, {
      zoomControl: true, attributionControl: true,
    }).setView(start, 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    // Invalidate size after mount so Leaflet picks up final container dimensions
    setTimeout(() => map.invalidateSize(), 60);
    return () => {
      map.remove();
      mapRef.current = null;
      markerObjsRef.current = new Map();
      didFitRef.current = false;
    };
  }, [leafletReady]);

  // Sync markers: add/update/remove without re-creating the map
  useEffect(() => {
    if (!leafletReady || !mapRef.current) return;
    const L = window.L;
    const map = mapRef.current;
    const existing = markerObjsRef.current;
    const seen = new Set();

    for (const m of markers) {
      seen.add(m.key);
      const latlng = [m.lat, m.lng];
      const prev = existing.get(m.key);
      if (prev) {
        prev.setLatLng(latlng);
        prev.setIcon(buildIcon(m.kind, m.label));
      } else {
        const marker = L.marker(latlng, { icon: buildIcon(m.kind, m.label) }).addTo(map);
        existing.set(m.key, marker);
      }
    }
    // Remove markers that vanished
    for (const [key, marker] of existing.entries()) {
      if (!seen.has(key)) {
        marker.remove();
        existing.delete(key);
      }
    }

    // Auto-fit to bounds the FIRST time we have markers, then leave the user in control
    if (markers.length > 0 && !didFitRef.current) {
      if (markers.length === 1) {
        map.setView([markers[0].lat, markers[0].lng], 14);
      } else {
        const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lng]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      }
      didFitRef.current = true;
    }
  }, [markers, leafletReady]);

  // Re-invalidate the map size whenever the container becomes visible again
  // (e.g. switching tabs in the groom dashboard).
  useEffect(() => {
    if (!mapRef.current) return;
    const id = setTimeout(() => mapRef.current && mapRef.current.invalidateSize(), 80);
    return () => clearTimeout(id);
  });

  if (!leafletReady) {
    return (
      <div style={{
        width: "100%", height,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(255,255,255,.03)", border: "1px dashed rgba(201,168,76,.2)",
        borderRadius: 14, color: "#7a6a4a", fontSize: 13,
      }}>
        {t("map_loading")}
      </div>
    );
  }
  return <div ref={containerRef} style={{ width: "100%", height, borderRadius: 14, overflow: "hidden" }}/>;
}

/* ══════════════════════════════════════ */
/* LANDING PAGE */
/* ══════════════════════════════════════ */
function LandingPage({ onEnterPortal, t, lang, setLang }) {
  const [navSection, setNavSection] = useState("hero");
  const [previewType, setPreviewType] = useState("premium");

  // Scroll-spy: highlight active nav item as user scrolls through sections
  useEffect(() => {
    const sections = ["hero", "about", "services", "pricing"];
    const onScroll = () => {
      let active = "hero";
      const threshold = window.innerHeight * 0.35;
      for (const id of sections) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= threshold) active = id;
        }
      }
      setNavSection(active);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id) => {
    setNavSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#07070a" }}>
      {/* ── NAV ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(7,7,10,.94)", backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(201,168,76,.1)", padding: "0 24px",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 22 }}>✉</span>
            <span style={{ fontSize: 21, fontWeight: 900, color: "#c9a84c", fontFamily: "'Amiri', serif" }}>{lang === "he" ? "דעוה" : "دعوة"}</span>
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
            {[
              ["hero",     t("nav_home")],
              ["about",    t("nav_about")],
              ["services", t("nav_services")],
              ["pricing",  t("nav_pricing")],
            ].map(([id, lbl]) => (
              <button key={id} className={`nav-tab${navSection===id?" active":""}`} onClick={() => scrollTo(id)}>{lbl}</button>
            ))}
            <div style={{ marginInline: 6 }}><LangSwitcher lang={lang} setLang={setLang} /></div>
            <button className="gold-btn" style={{ padding: "8px 18px", fontSize: 13 }} onClick={onEnterPortal}>
              {t("nav_portal")}
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section id="hero" style={{
        minHeight: "91vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        textAlign: "center", padding: "48px 24px",
        background: "radial-gradient(ellipse 70% 55% at 50% 0%, rgba(201,168,76,.07) 0%, transparent 70%)",
        position: "relative", overflow: "hidden",
      }}>
        {[200, 340, 480].map((s, i) => (
          <div key={i} style={{
            position: "absolute", width: s, height: s, borderRadius: "50%",
            border: "1px solid rgba(201,168,76,.05)",
            top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            pointerEvents: "none",
          }}/>
        ))}

        <div className="fade-up" style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 28 }}>
          <BrandLogo size={140} withText />
        </div>

        <h1 className="fade-up-2" style={{
          fontSize: "clamp(48px,9vw,88px)", fontWeight: 900,
          fontFamily: "'Amiri',serif", lineHeight: 1.1,
          background: "linear-gradient(135deg,#c9a84c 0%,#f0c84c 50%,#c9a84c 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          backgroundClip: "text", marginBottom: 10,
        }}>{lang === "he" ? "דעוה" : "دعوة"}</h1>

        <div className="fade-up-2" style={{
          fontSize: 13, color: "#a09070", letterSpacing: 1.5,
          marginBottom: 22, fontWeight: 600,
        }}>
          {t("hero_subtitle")}
        </div>

        <p className="fade-up-3" style={{
          fontSize: "clamp(16px,2.8vw,22px)", color: "rgba(245,230,184,.75)",
          maxWidth: 560, lineHeight: 1.8, marginBottom: 10,
        }}>
          {t("hero_tagline1")}<br/>
          {t("hero_tagline2")}
        </p>

        <p className="fade-up-3" style={{ fontSize: 13, color: "#5a5040", marginBottom: 36 }}>
          {t("hero_brand_pitch")}
        </p>

        <div className="fade-up-4" style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
          <button className="gold-btn" style={{ fontSize: 16, padding: "15px 36px" }} onClick={onEnterPortal}>
            {t("hero_cta_start")}
          </button>
          <button className="ghost-btn" onClick={() => scrollTo("services")}>
            {t("hero_cta_explore")}
          </button>
        </div>
      </section>

      {/* ── ABOUT ── */}
      <section id="about" style={{ padding: "80px 24px", maxWidth: 960, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div className="section-label">{t("about_label")}</div>
          <h2 style={{ fontSize: "clamp(26px,4vw,42px)", fontWeight: 900, color: "#c9a84c", fontFamily: "'Amiri',serif" }}>
            {t("about_title")}
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 18, marginBottom: 48 }}>
          {[
            { icon: "⏳", title: t("feat1_title"), body: t("feat1_body") },
            { icon: "✉",  title: t("feat2_title"), body: t("feat2_body") },
            { icon: "📍", title: t("feat3_title"), body: t("feat3_body") },
            { icon: "👔", title: t("feat4_title"), body: t("feat4_body") },
          ].map(c => (
            <div key={c.title} className="card">
              <div style={{ fontSize: 34, marginBottom: 12 }}>{c.icon}</div>
              <h3 style={{ fontWeight: 800, color: "#f5e6b8", marginBottom: 8, fontSize: 15 }}>{c.title}</h3>
              <p style={{ fontSize: 13, color: "#8a7a5a", lineHeight: 1.85 }}>{c.body}</p>
            </div>
          ))}
        </div>

        <div className="gold-card" style={{ padding: "32px 36px", textAlign: "center" }}>
          <BrandLogo size={56} />
          <div style={{ marginTop: 20, fontSize: 20, fontWeight: 900, color: "#c9a84c", fontFamily: "'Amiri',serif", marginBottom: 14 }}>
            {t("pers_title")}
          </div>
          <p style={{ color: "rgba(245,230,184,.8)", lineHeight: 2.1, fontSize: 14, maxWidth: 640, margin: "0 auto 22px" }}>
            {t("pers_body_full")[0]}
            <br/>
            {t("pers_body_full")[1]}<strong style={{ color: "#c9a84c" }}>{t("pers_body_full")[2]}</strong>{t("pers_body_full")[3]}
            <br/><br/>
            {t("pers_body_full")[4]}
            <br/>
            <strong style={{ color: "#c9a84c" }}>{t("pers_body_full")[5]}</strong>
          </p>
          <button className="gold-btn" onClick={onEnterPortal}>{t("pers_cta")}</button>
        </div>
      </section>

      {/* ── SERVICES ── */}
      <section id="services" style={{
        padding: "80px 24px",
        background: "rgba(201,168,76,.02)",
        borderTop: "1px solid rgba(201,168,76,.08)",
        borderBottom: "1px solid rgba(201,168,76,.08)",
      }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div className="section-label">{t("services_label")}</div>
            <h2 style={{ fontSize: "clamp(26px,4vw,42px)", fontWeight: 900, color: "#c9a84c", fontFamily: "'Amiri',serif" }}>
              {t("services_title")}
            </h2>
            <p style={{ color: "#7a6a4a", fontSize: 13, marginTop: 8 }}>
              {t("services_subtitle")}
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 32, flexWrap: "wrap" }}>
            {["premium","vip"].map(tp => (
              <button key={tp} onClick={() => setPreviewType(tp)} style={{
                padding: "9px 24px", borderRadius: 12, fontWeight: 800, fontSize: 14, cursor: "pointer",
                background: previewType===tp
                  ? tp==="vip" ? "rgba(155,75,212,.2)" : "rgba(201,168,76,.15)"
                  : "rgba(255,255,255,.04)",
                border: `1.5px solid ${previewType===tp ? (tp==="vip" ? "#c084fc" : "#c9a84c") : "rgba(255,255,255,.08)"}`,
                color: previewType===tp ? (tp==="vip" ? "#c084fc" : "#c9a84c") : "#7a6a4a",
                fontFamily: "inherit", transition: "all .2s",
              }}>
                {getInviteContent(lang)[tp].icon} {getInviteContent(lang)[tp].label}
              </button>
            ))}
          </div>

          {["premium","vip"].map(type => {
            const inv = getInviteContent(lang)[type];
            const isVip = type === "vip";
            if (previewType !== type) return null;
            return (
              <div key={type} style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
                gap: 28, marginBottom: 48, animation: "fadeIn .35s ease",
              }}>
                <div style={{
                  background: isVip ? "linear-gradient(145deg,#05050f,#0e0e22)" : "linear-gradient(145deg,#1a0e00,#2a1800)",
                  border: `1.5px solid ${isVip ? "#9b4bd4" : "#c9a84c"}`,
                  borderRadius: 22, padding: "36px 28px",
                  position: "relative", overflow: "hidden", textAlign: "center",
                }}>
                  <div style={{
                    position: "absolute", top: 0, left: 0, right: 0, height: 3,
                    background: `linear-gradient(90deg,transparent,${isVip ? "#9b4bd4" : "#c9a84c"},transparent)`,
                  }}/>
                  <div style={{ position: "absolute", top: 16, left: 16 }}>
                    <BrandLogo size={52} />
                  </div>
                  <div style={{ marginBottom: 8, color: isVip ? "#c084fc" : "#c9a84c", fontSize: 12, fontWeight: 800, letterSpacing: 2 }}>
                    {isVip ? "✦ VIP ROYAL ✦" : "✦ PREMIUM ✦"}
                  </div>
                  <div style={{ width: 40, height: 1, background: isVip ? "#9b4bd455" : "#c9a84c55", margin: "12px auto" }}/>
                  <p style={{ fontSize: 14, color: "rgba(245,230,184,.85)", lineHeight: 1.9, fontFamily: "'Amiri',serif" }}>
                    {inv.line2}<br/>
                    {inv.line3}<br/>
                    <strong style={{ color: isVip ? "#c084fc" : "#c9a84c" }}>{inv.line4}</strong><br/>
                    {inv.line5}
                  </p>
                  <div style={{ width: 40, height: 1, background: isVip ? "#9b4bd455" : "#c9a84c55", margin: "12px auto" }}/>
                  <p style={{ fontSize: 12, color: "rgba(245,230,184,.6)", fontStyle: "italic", marginBottom: 8 }}>{inv.closing}</p>
                  {inv.note && <p style={{ fontSize: 11, color: "#5a5040" }}>{inv.note}</p>}
                  <div style={{
                    position: "absolute", bottom: 0, left: 0, right: 0, height: 3,
                    background: `linear-gradient(90deg,transparent,${isVip ? "#9b4bd4" : "#c9a84c"},transparent)`,
                  }}/>
                </div>

                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>
                  <div style={{ fontSize: 13, color: "#7a6a4a", fontWeight: 700, marginBottom: 4 }}>
                    {t("feature_section")}
                  </div>
                  {inv.features.map(f => (
                    <div key={f} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                        background: isVip ? "rgba(155,75,212,.15)" : "rgba(201,168,76,.12)",
                        border: `1px solid ${isVip ? "#9b4bd455" : "#c9a84c55"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, color: isVip ? "#c084fc" : "#c9a84c",
                      }}>✓</div>
                      <span style={{ fontSize: 14, color: "rgba(245,230,184,.85)" }}>{f}</span>
                    </div>
                  ))}
                  <div style={{
                    marginTop: 8, padding: "10px 14px", borderRadius: 10,
                    background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)",
                    fontSize: 12, color: "#7a6a4a",
                  }}>
                    {t("both_types_note")}
                  </div>
                </div>
              </div>
            );
          })}

          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <h3 style={{ color: "#c9a84c", fontSize: 17, fontWeight: 800, marginBottom: 20 }}>{t("delivery_title")}</h3>
          </div>
          <div className="gold-card" style={{ padding: "24px 28px", textAlign: "center", maxWidth: 560, margin: "0 auto" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🚀</div>
            <div style={{ fontWeight: 900, color: "#c9a84c", fontSize: 18, marginBottom: 6 }}>{t("delivery_subtitle")}</div>
            <div style={{ fontSize: 13, color: "rgba(245,230,184,.7)", lineHeight: 1.8 }}>
              {t("delivery_body_lines").map((line, i) => (
                <span key={i}>{line}{i < t("delivery_body_lines").length - 1 && <br/>}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ padding: "80px 24px", maxWidth: 760, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div className="section-label">{t("pricing_label")}</div>
          <h2 style={{ fontSize: "clamp(26px,4vw,42px)", fontWeight: 900, color: "#c9a84c", fontFamily: "'Amiri',serif" }}>
            {t("pricing_title")}
          </h2>
          <p style={{ color: "#7a6a4a", fontSize: 13, marginTop: 8 }}>
            {t("pricing_subtitle")}
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 18, marginBottom: 32 }}>
          <div style={{
            background: "linear-gradient(145deg,#1a0e00,#2a1800)",
            border: "1.5px solid #c9a84c55", borderRadius: 22, padding: 28, textAlign: "center",
          }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✦</div>
            <h3 style={{ color: "#c9a84c", fontSize: 19, fontWeight: 900, marginBottom: 8 }}>{t("price_premium_title")}</h3>
            <div style={{ fontSize: 13, color: "rgba(245,230,184,.6)", lineHeight: 1.8, marginBottom: 12 }}>
              <strong style={{ color: "#c9a84c", fontSize: 22 }}>{t("price_premium_discount")}</strong><br/>
              {t("price_premium_vs")}
            </div>
            <div style={{ fontSize: 12, color: "#5a5040", marginBottom: 20 }}>
              {t("price_premium_body")}
            </div>
            <button className="ghost-btn" style={{ width: "100%" }} onClick={onEnterPortal}>
              {t("price_contact")}
            </button>
          </div>

          <div style={{
            background: "linear-gradient(145deg,#05050f,#0d0d20)",
            border: "1.5px solid #9b4bd4", borderRadius: 22, padding: 28, textAlign: "center",
            position: "relative",
          }}>
            <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
              background: "linear-gradient(135deg,#9b4bd4,#c084fc)", color: "#fff",
              padding: "4px 18px", borderRadius: 20, fontSize: 11, fontWeight: 900, whiteSpace: "nowrap",
            }}>{t("price_vip_badge")}</div>
            <div style={{ fontSize: 40, marginBottom: 10 }}>♛</div>
            <h3 style={{ color: "#c084fc", fontSize: 19, fontWeight: 900, marginBottom: 8 }}>{t("price_vip_title")}</h3>
            <div style={{ fontSize: 13, color: "rgba(245,230,184,.6)", lineHeight: 1.8, marginBottom: 12 }}>
              <strong style={{ color: "#c084fc", fontSize: 22 }}>{t("price_vip_normal")}</strong><br/>
              {t("price_vip_pitch")}
            </div>
            <div style={{ fontSize: 12, color: "#5a5040", marginBottom: 20 }}>
              {t("price_vip_body")}
            </div>
            <button className="gold-btn" style={{ width: "100%" }} onClick={onEnterPortal}>
              {t("price_contact")}
            </button>
          </div>
        </div>

        <div style={{
          marginTop: 28, padding: "18px 24px", textAlign: "center",
          background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 14,
          fontSize: 13, color: "#7a6a4a",
        }}>
          {t("price_both_note")}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: "1px solid rgba(201,168,76,.1)", padding: "40px 24px", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 22 }}>✉</span>
          <span style={{ fontFamily: "'Amiri',serif", fontSize: 22, color: "#c9a84c" }}>{lang === "he" ? "דעוה" : "دعوة"}</span>
        </div>
        <div style={{ fontSize: 12, color: "#5a5040", marginBottom: 16 }}>
          {t("footer_tagline")}
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="ghost-btn" style={{ padding: "8px 18px", fontSize: 12 }} onClick={onEnterPortal}>{t("nav_portal")}</button>
        </div>
      </footer>
    </div>
  );
}

/* ══════════════════════════════════════ */
/* GROOM PORTAL  (login routes to Groom OR Distributor) */
/* ══════════════════════════════════════ */
/* ══════════════════════════════════════ */
/* LOGOUT CONFIRMATION MODAL */
/* ══════════════════════════════════════ */
function LogoutConfirm({ t, onConfirm, onCancel }) {
  return (
    <div onClick={onCancel} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.78)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1500, padding: 20, animation: "fadeIn .25s ease",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        maxWidth: 380, width: "100%",
        background: "#0c0c11", border: "1px solid rgba(212,80,58,.4)",
        borderRadius: 18, padding: 28, animation: "slideUp .3s ease", textAlign: "center",
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>👋</div>
        <div style={{ color: "#d47a4b", fontWeight: 900, fontSize: 18, marginBottom: 10 }}>
          {t("logout_confirm_title")}
        </div>
        <div style={{ color: "rgba(245,230,184,.8)", fontSize: 14, lineHeight: 1.8, marginBottom: 22 }}>
          {t("logout_confirm_body")}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} className="ghost-btn" style={{ flex: 1 }}>
            {t("logout_confirm_no")}
          </button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: "12px 18px", borderRadius: 14, border: "none",
            background: "linear-gradient(135deg,#d47a4b,#b03020)",
            color: "#fff", fontSize: 14, fontWeight: 900, fontFamily: "inherit", cursor: "pointer",
          }}>
            {t("logout_confirm_yes")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════ */
/* LOCAL CITIES DATABASE                    */
/* Instant suggestions even when offline / API is rate-limited */
/* ══════════════════════════════════════ */
const CITIES_DB = [
  // Major cities
  { ar: "حيفا", he: "חיפה" }, { ar: "حولون", he: "חולון" },
  { ar: "حاديرا", he: "חדרה" }, { ar: "حرفيش", he: "חורפיש" },
  { ar: "حورة", he: "חורה" },
  { ar: "تل أبيب", he: "תל אביב" }, { ar: "يافا", he: "יפו" },
  { ar: "القدس", he: "ירושלים" }, { ar: "بات يام", he: "בת ים" },
  { ar: "بتاح تكفا", he: "פתח תקווה" }, { ar: "ريشون لتسيون", he: "ראשון לציון" },
  { ar: "نتانيا", he: "נתניה" }, { ar: "أشدود", he: "אשדוד" },
  { ar: "أشكلون", he: "אשקלון" }, { ar: "هرتسليا", he: "הרצליה" },
  { ar: "كفار سبا", he: "כפר סבא" }, { ar: "رعنانا", he: "רעננה" },
  { ar: "بئر السبع", he: "באר שבע" }, { ar: "ديمونا", he: "דימונה" },
  { ar: "العفولة", he: "עפולה" }, { ar: "نهاريا", he: "נהריה" },
  { ar: "عكا", he: "עכו" }, { ar: "كرمئيل", he: "כרמיאל" },
  { ar: "صفد", he: "צפת" }, { ar: "طبريا", he: "טבריה" },
  { ar: "إيلات", he: "אילת" }, { ar: "بيت شيمش", he: "בית שמש" },
  { ar: "موديعين", he: "מודיעין" }, { ar: "غفعتايم", he: "גבעתיים" },
  { ar: "رمات غان", he: "רמת גן" }, { ar: "بني براك", he: "בני ברק" },
  { ar: "ريحوفوت", he: "רחובות" }, { ar: "نيس تسيونا", he: "נס ציונה" },
  { ar: "يهود", he: "יהוד" }, { ar: "كرياتشمونا", he: "קריית שמונה" },
  // Arab cities and towns in Israel
  { ar: "الناصرة", he: "נצרת" }, { ar: "شفاعمرو", he: "שפרעם" },
  { ar: "سخنين", he: "סח'נין" }, { ar: "أم الفحم", he: "אום אל-פחם" },
  { ar: "الطيرة", he: "טירה" }, { ar: "الطيبة", he: "טייבה" },
  { ar: "قلنسوة", he: "קלנסווה" }, { ar: "كفر قاسم", he: "כפר קאסם" },
  { ar: "اللد", he: "לוד" }, { ar: "الرملة", he: "רמלה" },
  { ar: "باقة الغربية", he: "באקה אל-גרבייה" },
  { ar: "كفر قرع", he: "כפר קרע" }, { ar: "كفر كنا", he: "כפר כנא" },
  { ar: "عرابة", he: "עראבה" }, { ar: "دير حنا", he: "דיר חנא" },
  { ar: "مجد الكروم", he: "מג'ד אל-כרום" }, { ar: "نحف", he: "נחף" },
  { ar: "البعنة", he: "בענה" }, { ar: "دير الأسد", he: "דייר אל-אסד" },
  { ar: "كابول", he: "כאבול" }, { ar: "طمرة", he: "טמרה" },
  { ar: "كفر مندا", he: "כפר מנדא" }, { ar: "إكسال", he: "אכסאל" },
  { ar: "يافة الناصرة", he: "יפיע" }, { ar: "كفر كما", he: "כפר כמא" },
  { ar: "إعبلين", he: "אעבלין" }, { ar: "كفر ياسيف", he: "כפר יאסיף" },
  { ar: "أبو سنان", he: "אבו סנאן" }, { ar: "البقيعة", he: "פקיעין" },
  { ar: "المغار", he: "מע'אר" }, { ar: "جولس", he: "ג'וליס" },
  { ar: "يركا", he: "ירכא" }, { ar: "جت", he: "ג'ת" },
  { ar: "جسر الزرقاء", he: "ג'סר א-זרקא" }, { ar: "زيمر", he: "זמר" },
  { ar: "جلجولية", he: "ג'לג'וליה" }, { ar: "كفر برا", he: "כפר ברא" },
  { ar: "اللقية", he: "לקיה" }, { ar: "رهط", he: "רהט" },
  { ar: "تل السبع", he: "תל שבע" }, { ar: "كسيفة", he: "כסייפה" },
  { ar: "عرعرة", he: "ערערה" }, { ar: "عرعرة النقب", he: "ערערה בנגב" },
  { ar: "شقيب السلام", he: "שגב שלום" },
  { ar: "كفر مصر", he: "כפר מצר" }, { ar: "كوكب أبو الهيجاء", he: "כאוכב אבו אל-היג'א" },
  { ar: "بسمة طبعون", he: "בסמת טבעון" }, { ar: "إبطن", he: "אבטין" },
  { ar: "بستان المرج", he: "בוסתן אל-מרג'" },
  { ar: "ميسر", he: "מייסר" }, { ar: "زمر", he: "זמר" },
  { ar: "بيت جن", he: "בית ג'ן" }, { ar: "ساجور", he: "סאג'ור" },
  { ar: "كسرى", he: "כסרא" }, { ar: "الرينة", he: "ריינה" },
  { ar: "المشهد", he: "אל-משהד" }, { ar: "طرعان", he: "טורעאן" },
  { ar: "بئر المكسور", he: "ביר אל-מכסור" },
  { ar: "البطوف", he: "בטוף" }, { ar: "روماط بني", he: "רוממה" },
  { ar: "زرزير", he: "זרזיר" }, { ar: "كعبية طباش", he: "כעביה טבאש" },
  { ar: "حجاجرة", he: "חוג'יג'רה" },
  // West Bank
  { ar: "بيت لحم", he: "בית לחם" }, { ar: "رام الله", he: "רמאללה" },
  { ar: "نابلس", he: "שכם" }, { ar: "الخليل", he: "חברון" },
  { ar: "جنين", he: "ג'נין" }, { ar: "طولكرم", he: "טולכרם" },
  { ar: "قلقيلية", he: "קלקיליה" }, { ar: "أريحا", he: "יריחו" },
  { ar: "سلفيت", he: "סלפית" }, { ar: "طوباس", he: "טובאס" },
  { ar: "بيت ساحور", he: "בית סאחור" }, { ar: "بيت جالا", he: "בית ג'אלה" },
  { ar: "البيرة", he: "אל-בירה" }, { ar: "يطا", he: "יטא" },
  // Gaza
  { ar: "غزة", he: "עזה" }, { ar: "خان يونس", he: "ח'אן יונס" },
  { ar: "رفح", he: "רפיח" }, { ar: "دير البلح", he: "דיר אל-בלח" },
  { ar: "بيت حانون", he: "בית חאנון" }, { ar: "بيت لاهيا", he: "בית להיא" },
];

/* ══════════════════════════════════════ */
/* CITY FIELD — picks a city from the local CITIES_DB                 */
/* ══════════════════════════════════════ */
function CityField({ value, onChange, lang, t }) {
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const q = (value || "").trim().toLowerCase();
    if (q.length < 1) return CITIES_DB.slice(0, 8);
    const startsWith = (s) => s.toLowerCase().startsWith(q);
    const includes   = (s) => s.toLowerCase().includes(q);
    const starts = CITIES_DB.filter(c => startsWith(c.ar) || startsWith(c.he));
    const incs   = CITIES_DB.filter(c => !startsWith(c.ar) && !startsWith(c.he) && (includes(c.ar) || includes(c.he)));
    return [...starts, ...incs].slice(0, 8);
  }, [value]);

  return (
    <div style={{ position: "relative" }}>
      <input className="input-field" type="text" placeholder={t("addr_city_placeholder")}
             value={value}
             onChange={e => { onChange(e.target.value); setOpen(true); }}
             onFocus={() => setOpen(true)}
             onBlur={() => setTimeout(() => setOpen(false), 200)}/>
      {open && matches.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          background: "#0c0c11", border: "1px solid rgba(201,168,76,.3)",
          borderRadius: 12, marginTop: 4, padding: 6,
          maxHeight: 260, overflowY: "auto", zIndex: 100,
          boxShadow: "0 8px 28px rgba(0,0,0,.6)",
        }}>
          {matches.map(c => {
            const primary = lang === "he" ? c.he : c.ar;
            const secondary = lang === "he" ? c.ar : c.he;
            return (
              <div key={c.ar} onMouseDown={e => e.preventDefault()}
                   onClick={() => { onChange(primary); setOpen(false); }}
                   style={{
                     padding: "9px 12px", borderRadius: 8, cursor: "pointer",
                     fontSize: 13, color: "#f5e6b8", lineHeight: 1.5,
                     transition: "background .15s",
                     display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
                   }}
                   onMouseEnter={e => e.currentTarget.style.background = "rgba(201,168,76,.12)"}
                   onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{ fontWeight: 700 }}>🏘 {primary}</span>
                <span style={{ fontSize: 11, color: "#5a5040" }}>{secondary}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════ */
/* STREET FIELD — autocompletes streets within the chosen city        */
/* Queries Nominatim + Photon, restricted to the city scope.          */
/* ══════════════════════════════════════ */
function StreetField({ value, onChange, city, lang, t }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const debounceRef = useRef(null);

  // Get the Hebrew + Arabic name of the city from CITIES_DB if we know it
  const cityNames = useMemo(() => {
    const trimmed = (city || "").trim();
    if (!trimmed) return { he: trimmed, ar: trimmed };
    const lower = trimmed.toLowerCase();
    const found = CITIES_DB.find(c =>
      c.ar.toLowerCase() === lower || c.he.toLowerCase() === lower
    );
    return found ? { he: found.he, ar: found.ar } : { he: trimmed, ar: trimmed };
  }, [city]);

  useEffect(() => {
    if (!open) return;
    const q = (value || "").trim();
    if (q.length < 1) { setResults([]); setLoading(false); return; }
    if (!city || !city.trim()) { setResults([]); setLoading(false); return; }
    clearTimeout(debounceRef.current);
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const langCode = lang === "he" ? "he,en,ar" : "ar,en,he";
      const queries = [
        `${q} ${cityNames.he}`,
        `${q} ${cityNames.ar}`,
        `${cityNames.he} ${q}`,
      ];
      let found = [];

      // 1) Nominatim free-text search
      for (const variant of queries) {
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=jsonv2`
                    + `&q=${encodeURIComponent(variant)}`
                    + `&countrycodes=il,ps&accept-language=${langCode}&limit=10&addressdetails=1&namedetails=1&dedupe=1`;
          const res = await fetch(url);
          if (!res.ok) continue;
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            found = data;
            break;
          }
        } catch {}
      }

      // 2) Photon fallback
      if (found.length === 0) {
        for (const variant of queries) {
          try {
            const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(variant)}&limit=10`;
            const res = await fetch(url);
            if (!res.ok) continue;
            const data = await res.json();
            if (data && Array.isArray(data.features) && data.features.length > 0) {
              const filtered = data.features
                .filter(f => {
                  const cc = (f.properties.countrycode || "").toUpperCase();
                  return cc === "IL" || cc === "PS";
                })
                .map(f => {
                  const p = f.properties;
                  const parts = [p.name, p.street, p.city, p.state].filter(Boolean);
                  return {
                    place_id: p.osm_id || `${Math.random()}`,
                    display_name: [...new Set(parts)].join(", "),
                    type: p.osm_value || p.osm_key || "place",
                    class: p.osm_key,
                  };
                });
              if (filtered.length > 0) { found = filtered; break; }
            }
          } catch {}
        }
      }

      // Keep only results that look like streets/places within the city
      const cityLower = (cityNames.he + " " + cityNames.ar).toLowerCase();
      const filtered = found.filter(r => {
        const dn = (r.display_name || "").toLowerCase();
        return cityLower.split(" ").some(w => w && dn.includes(w));
      });
      setResults(filtered.length > 0 ? filtered : found);
      setLoading(false);
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [value, open, city, lang, cityNames.he, cityNames.ar]);

  const labelFor = (r) => {
    if (!r.display_name) return "";
    const parts = r.display_name.split(",").map(s => s.trim()).filter(Boolean);
    // Drop "Israel" / "ישראל" / "إسرائيل" from the tail to keep label short
    const cleaned = parts.filter(p => !/^(ישראל|إسرائيل|israel|פלסטין|فلسطين|palestine)$/i.test(p));
    return cleaned.slice(0, 2).join("، ");
  };

  return (
    <div style={{ position: "relative" }}>
      <input className="input-field" type="text" placeholder={t("addr_street_placeholder")}
             value={value}
             onChange={e => { onChange(e.target.value); setOpen(true); }}
             onFocus={() => setOpen(true)}
             onBlur={() => setTimeout(() => setOpen(false), 200)}/>
      {open && (loading || results.length > 0 || (value || "").trim().length >= 1) && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          background: "#0c0c11", border: "1px solid rgba(201,168,76,.3)",
          borderRadius: 12, marginTop: 4, padding: 6,
          maxHeight: 260, overflowY: "auto", zIndex: 100,
          boxShadow: "0 8px 28px rgba(0,0,0,.6)",
        }}>
          {loading && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: "#7a6a4a", textAlign: "center" }}>
              {t("addr_loading")}
            </div>
          )}
          {!loading && results.length === 0 && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: "#7a6a4a", textAlign: "center" }}>
              {t("addr_no_matches")}
            </div>
          )}
          {!loading && results.map(r => (
            <div key={r.place_id} onMouseDown={e => e.preventDefault()}
                 onClick={() => { onChange(labelFor(r)); setOpen(false); }}
                 style={{
                   padding: "9px 12px", borderRadius: 8, cursor: "pointer",
                   fontSize: 13, color: "#f5e6b8", lineHeight: 1.5,
                   transition: "background .15s",
                 }}
                 onMouseEnter={e => e.currentTarget.style.background = "rgba(201,168,76,.12)"}
                 onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div style={{ fontWeight: 700 }}>🛣 {labelFor(r)}</div>
              {r.type && (
                <div style={{ fontSize: 10, color: "#7a6a4a", marginTop: 2 }}>
                  {r.class === "highway" || /residential|tertiary|primary|secondary/.test(r.type || "")
                    ? (lang === "he" ? "🛣 רחוב" : "🛣 شارع")
                    : `📍 ${r.type}`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════ */
/* ADDRESS INPUT — two fields: city then street                       */
/* The combined "city، street" string is sent up via onChange.        */
/* ══════════════════════════════════════ */
function AddressInput({ value, onChange, placeholder, lang, t }) {
  // Parse incoming "value" into city + street ONCE on mount, so editing works
  const initialised = useRef(false);
  const [cityVal, setCityVal]     = useState("");
  const [streetVal, setStreetVal] = useState("");

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    const raw = (value || "").trim();
    if (!raw) return;
    // Find longest known-city prefix
    const lower = raw.toLowerCase();
    let best = null;
    for (const c of CITIES_DB) {
      const ar = c.ar.toLowerCase();
      const he = c.he.toLowerCase();
      if (lower.startsWith(ar) && (!best || c.ar.length > best.len)) best = { matched: c.ar, len: c.ar.length };
      if (lower.startsWith(he) && (!best || c.he.length > best.len)) best = { matched: c.he, len: c.he.length };
    }
    if (best) {
      setCityVal(best.matched);
      setStreetVal(raw.slice(best.len).replace(/^[\s،,\-]+/, "").trim());
    } else {
      setCityVal(raw);
    }
  }, [value]);

  // Compose combined string back to parent on any change
  useEffect(() => {
    const combined = [cityVal.trim(), streetVal.trim()].filter(Boolean).join("، ");
    if (combined !== value) onChange(combined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityVal, streetVal]);

  return (
    <div>
      <div style={{ marginBottom: 5, fontSize: 11, color: "#7a6a4a", fontWeight: 700 }}>
        🏘 {t("addr_city_field")}
      </div>
      <div style={{ marginBottom: 12 }}>
        <CityField value={cityVal} onChange={setCityVal} lang={lang} t={t}/>
      </div>

      <div style={{ marginBottom: 5, fontSize: 11, color: "#7a6a4a", fontWeight: 700 }}>
        🛣 {t("addr_street_field")}
      </div>
      {cityVal.trim() ? (
        <StreetField value={streetVal} onChange={setStreetVal}
                     city={cityVal} lang={lang} t={t}/>
      ) : (
        <div style={{
          padding: "12px 14px", borderRadius: 12, fontSize: 12,
          background: "rgba(255,255,255,.03)", border: "1px dashed rgba(255,255,255,.1)",
          color: "#5a5040", textAlign: "center",
        }}>
          {t("addr_pick_city_first")}
        </div>
      )}
    </div>
  );
}

function GroomPortal({ onBack, t, lang, setLang }) {
  // ── Persistence helpers (localStorage) ──
  const load = (key, fallback) => {
    try { const v = localStorage.getItem(key); return v != null ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  };
  const save = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };
  const removeKey = (key) => { try { localStorage.removeItem(key); } catch {} };

  // ── Session persistence ──
  const [authed, setAuthed]     = useState(() => load("dawa_session_authed", false));
  const [userType, setUserType] = useState(() => load("dawa_session_type", null));
  const [currentUsername, setCurrentUsername] = useState(() => load("dawa_session_user", null));
  const [driverServingGroom, setDriverServingGroom] = useState(() => load("dawa_driver_serving_groom", null));

  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [guests, setGuests] = useState(() => load("dawa_guests", SAMPLE_GUESTS));
  const [tab, setTab] = useState(() => load("dawa_session_tab", "dashboard"));
  const [toast, setToast] = useState(null);

  // Logout confirmation
  const [logoutAsking, setLogoutAsking] = useState(false);

  // Driver: pick-groom screen state
  const [driverGroomInput, setDriverGroomInput] = useState("");
  const [driverGroomError, setDriverGroomError] = useState("");

  // Shared-cities feature
  const [sharedStep, setSharedStep]               = useState("pickGrooms"); // "pickGrooms" | "pickCity" | "viewRoute"
  const [sharedSelectedGrooms, setSharedSelectedGrooms] = useState([]);
  const [sharedSelectedCity, setSharedSelectedCity]     = useState(null);

  // ── ADMIN: WhatsApp invitation system ──
  const [adminTab, setAdminTab] = useState("users"); // users | send | confirmations | settings
  const [adminSelectedGroom, setAdminSelectedGroom] = useState(null);
  const [adminMessageBody, setAdminMessageBody] = useState(
    () => load("dawa_admin_msg",
      "شركة دعوة ترحب بكم 🌸\nنحن شركة دعوة — متخصصون في توصيل مكاتيب الأعراس بطريقة احترافية وراقية.\n\nيُرجى تأكيد بياناتكم من خلال الرابط أدناه ليتمكن المرسل من إيصال المكتوب إليكم:")
  );
  const [adminFormLink, setAdminFormLink] = useState(() => load("dawa_admin_link", ""));
  const [confirmations, setConfirmations] = useState(() => load("dawa_confirmations", []));
  const [editingConf, setEditingConf] = useState(null);

  // Admin: managed users (persisted)
  const [users, setUsers] = useState(() => load("dawa_users", [
    { id: 1, role: "groom",  username: "groom",  password: "1234" },
    { id: 2, role: "driver", username: "driver", password: "1234" },
  ]));
  const [newUserRole, setNewUserRole] = useState("groom");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPass, setNewUserPass] = useState("");

  // Groom: add-guest form state
  const [gName, setGName]   = useState("");
  const [gPhone, setGPhone] = useState("");
  const [gArea, setGArea]   = useState("");
  const [gType, setGType]   = useState("premium");

  // Groom: edit-guest modal state
  const [editingGuest, setEditingGuest] = useState(null);
  const [eName, setEName]   = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eArea, setEArea]   = useState("");
  const [eType, setEType]   = useState("premium");

  // Groom: swipe-to-delete reveal state (guest id whose remove action is shown)
  const [revealedId, setRevealedId] = useState(null);
  const swipeStartRef = useRef({ id: null, x: 0 });

  // Distributor: delivery form state
  const [activeId, setActiveId]   = useState(null);
  const [photoTaken, setPhotoTaken] = useState(false);
  const [deliveryNote, setDeliveryNote] = useState("");

  // Distributor → Groom: live location share (per-driver, with explicit shareWith list)
  // Shape: { [driverUsername]: { lat, lng, accuracy, timeISO, shareWith: [groomUsername...] } }
  const [liveLocations, setLiveLocations] = useState(() => load("dawa_live_locations", {}));
  const [liveShareWith, setLiveShareWith] = useState([]);

  // ── Geolocation state ──
  // Driver: am I broadcasting? Did I get GPS permission? What's my latest fix?
  const [driverIsSharing,     setDriverIsSharing]     = useState(false);
  const [driverGeoPermission, setDriverGeoPermission] = useState("unknown"); // unknown | granted | denied
  const [driverGeoError,      setDriverGeoError]      = useState(null);
  const [driverCoords,        setDriverCoords]        = useState(null); // {lat, lng, accuracy}
  const driverWatchIdRef  = useRef(null);
  const driverCoordsRef   = useRef(null);

  // Groom: do I want to see myself on the map? GPS permission?
  const [groomGeoPermission, setGroomGeoPermission] = useState("unknown");
  const [groomGeoError,      setGroomGeoError]      = useState(null);
  const [groomCoords,        setGroomCoords]        = useState(null);
  const groomWatchIdRef = useRef(null);

  // Ticking state — bumps every second so live-map markers re-render and the
  // staleness filter re-evaluates even when liveLocations itself hasn't changed.
  const [nowTick, setNowTick] = useState(0);

  // Photo viewer (groom clicks proof image)
  const [viewingPhoto, setViewingPhoto] = useState(null);
  // Captured photo (data-URL) before delivery confirm
  const [photoData, setPhotoData] = useState(null);

  // ── Persist on change ──
  useEffect(() => { save("dawa_guests", guests); }, [guests]);
  useEffect(() => { save("dawa_users",  users);  }, [users]);
  useEffect(() => { save("dawa_live_locations", liveLocations); }, [liveLocations]);
  // Session
  useEffect(() => { save("dawa_session_authed", authed); }, [authed]);
  useEffect(() => { save("dawa_session_type",   userType); }, [userType]);
  useEffect(() => { save("dawa_session_user",   currentUsername); }, [currentUsername]);
  useEffect(() => { save("dawa_session_tab",    tab); }, [tab]);
  useEffect(() => { save("dawa_driver_serving_groom", driverServingGroom); }, [driverServingGroom]);
  // Admin
  useEffect(() => { save("dawa_admin_msg",  adminMessageBody); }, [adminMessageBody]);
  useEffect(() => { save("dawa_admin_link", adminFormLink);    }, [adminFormLink]);
  useEffect(() => { save("dawa_confirmations", confirmations); }, [confirmations]);

  // ── WhatsApp helpers ──
  // Convert a local Israeli/Palestinian phone (starts with 0) to international format for wa.me
  const toIntlPhone = (raw) => {
    const digits = (raw || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("972") || digits.startsWith("970")) return digits;
    if (digits.startsWith("0"))   return "972" + digits.slice(1); // assume Israel
    return digits;
  };
  // Build wa.me URL for a guest (phone + admin's customised message + form link)
  const waLinkFor = (phone) => {
    const intl = toIntlPhone(phone);
    if (!intl) return "";
    const body = (adminMessageBody || "").trim();
    const link = (adminFormLink || "").trim();
    const text = [body, link].filter(Boolean).join("\n\n");
    return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
  };
  const sendWaToOne = (phone) => {
    const url = waLinkFor(phone);
    if (!url) { showToast(t("share_invalid")); return; }
    window.open(url, "_blank", "noopener");
  };
  const sendWaToAll = (groomUsername) => {
    if (!adminFormLink.trim()) { showToast(t("admin_form_link")); return; }
    const groomGuests = guests.filter(g => g.groomUsername === groomUsername);
    if (groomGuests.length === 0) return;
    showToast(t("admin_bulk_warn"));
    // Open each in a new tab — browsers may block; user must allow popups
    groomGuests.forEach((g, i) => {
      const url = waLinkFor(g.phone);
      if (url) setTimeout(() => window.open(url, "_blank", "noopener"), i * 300);
    });
  };

  // ── Match a confirmation against the groom's invited guests by phone ──
  const matchedGuestFor = (conf) => {
    const wantedPhone = (conf.submittedPhone || "").replace(/\D/g, "");
    if (!wantedPhone) return null;
    return guests.find(g => {
      if (g.groomUsername !== conf.groomUsername) return false;
      return (g.phone || "").replace(/\D/g, "") === wantedPhone;
    }) || null;
  };
  // Decide the color (green/red) for a confirmation card
  const matchColor = (conf) => {
    const guest = matchedGuestFor(conf);
    if (!guest) return "red"; // unknown — no matching phone
    const sameName = (guest.name || "").trim().toLowerCase() === (conf.submittedName || "").trim().toLowerCase();
    if (!sameName) return "red";
    const groomCity = (guest.area || "").split(/[-،,]/)[0].trim().toLowerCase();
    const guestCity = (conf.submittedCity || "").trim().toLowerCase();
    // Green if: groom had no city OR cities match
    if (!groomCity || groomCity === guestCity) return "green";
    return "red";
  };

  // ── Admin: apply confirmation edits to the matched guest record ──
  const useConfirmationData = (conf) => {
    const guest = matchedGuestFor(conf);
    if (!guest) return;
    const fullAddr = [conf.submittedCity, conf.submittedStreet, conf.submittedHouse].filter(Boolean).join("، ");
    setGuests(prev => prev.map(g => g.id === guest.id ? {
      ...g, name: conf.submittedName || g.name, phone: conf.submittedPhone || g.phone,
      area: fullAddr || g.area,
    } : g));
    showToast(t("edit_success"));
  };

  // ── Active groom username (whose guests we're operating on) ──
  // For groom: their own username. For driver: the groom they picked. For admin: none.
  const activeGroomUsername = userType === "groom" ? currentUsername
                            : userType === "driver" ? driverServingGroom
                            : null;

  // Filtered guest list for the active session
  const myGuests = useMemo(() =>
    activeGroomUsername
      ? guests.filter(g => g.groomUsername === activeGroomUsername)
      : guests,
    [guests, activeGroomUsername]
  );

  // ── Extract coordinates from any Google Maps URL or raw "lat,lng" string ──
  const extractCoords = (raw) => {
    if (!raw) return null;
    const url = raw.trim();
    const patterns = [
      /@(-?\d+\.\d+),(-?\d+\.\d+)/,                  // @lat,lng (most common)
      /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,              // encoded place URL
      /[?&]q=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,          // ?q=lat,lng
      /[?&]ll=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,         // ?ll=lat,lng
      /[?&]center=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,     // ?center=lat,lng
      /^(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)$/,      // bare "lat,lng" input
      /(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,        // any "lat,lng" inside URL (last resort)
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) {
        const lat = parseFloat(m[1]);
        const lng = parseFloat(m[2]);
        if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return [lat, lng];
      }
    }
    return null;
  };

  // Treat any t.me URL as embeddable (covers /channel/123 and /s/channel etc.)
  const isTelegramLink = (raw) => /t\.me/.test((raw || "").trim());

  // ── URL → embed-friendly URL ──
  const toEmbedUrl = (url) => {
    if (!url) return "";

    // إذا كان الرابط من تليجرام
    if (url.includes("t.me")) {
      // لو الرابط للمعاينة السريعة للقناة كاملة، بنخليه زي ما هو
      if (url.includes("t.me/s/")) {
        return url;
      }
      // لو الرابط لرسالة الموقع الحي المحددة، بنضيف التعديل هاد عشان يفك الحظر
      return url.includes("?") ? `${url}&embed=1` : `${url}?embed=1`;
    }

    // Coordinate-based / Google Maps legacy support
    const coords = extractCoords(url);
    if (coords) {
      const [lat, lng] = coords;
      const delta = 0.005;
      const bbox = `${lng - delta}%2C${lat - delta}%2C${lng + delta}%2C${lat + delta}`;
      return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
    }
    if (url.includes("/maps/embed") || url.includes("output=embed")) return url;
    if (/google\.[a-z.]+\/maps/.test(url)) {
      return url + (url.includes("?") ? "&" : "?") + "output=embed";
    }
    return url;
  };

  // ── Logout ──
  const doLogout = () => {
    setAuthed(false);
    setUserType(null);
    setCurrentUsername(null);
    setDriverServingGroom(null);
    setLoginUser("");
    setLoginPass("");
    setTab("dashboard");
    setSharedStep("pickGrooms");
    setSharedSelectedGrooms([]);
    setSharedSelectedCity(null);
    setLogoutAsking(false);
    // Clear session-specific localStorage but keep persistent data (guests, users, live url)
    removeKey("dawa_session_authed");
    removeKey("dawa_session_type");
    removeKey("dawa_session_user");
    removeKey("dawa_session_tab");
    removeKey("dawa_driver_serving_groom");
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3200); };

  const stats = useMemo(() => {
    const total = myGuests.length;
    const delivered = myGuests.filter(g => g.status === "delivered").length;
    const enroute   = myGuests.filter(g => g.status === "enroute").length;
    const pending   = myGuests.filter(g => g.status === "pending").length;
    return { total, delivered, enroute, pending, pct: total ? Math.round(delivered/total*100) : 0 };
  }, [myGuests]);

  const handleLogin = () => {
    const u = loginUser.trim();
    const p = loginPass;
    // Admin (hidden, hardcoded — only the owner knows it)
    if (u === "admin" && p === "admin2026") {
      setAuthed(true); setUserType("admin"); setCurrentUsername("admin");
      setLoginError(""); setTab("admin");
      return;
    }
    // Dynamic users created by admin
    const found = users.find(usr => usr.username === u && usr.password === p);
    if (found) {
      setAuthed(true); setUserType(found.role); setCurrentUsername(found.username);
      setLoginError("");
      setTab(found.role === "driver" ? "pending" : "dashboard");
      // For drivers: ensure they pick a groom (will be shown if driverServingGroom is null)
    } else {
      setLoginError(t("login_error"));
    }
  };

  // Driver picks the groom they serve
  const submitDriverGroom = () => {
    const name = driverGroomInput.trim();
    if (!name) { setDriverGroomError(t("driver_pick_groom_invalid")); return; }
    const groomUser = users.find(u => u.role === "groom" && u.username === name);
    if (!groomUser) { setDriverGroomError(t("driver_pick_groom_invalid")); return; }
    setDriverServingGroom(name);
    setDriverGroomInput("");
    setDriverGroomError("");
    setTab("pending");
  };

  // ── Field validators ──
  const validateName = (raw) => {
    const words = raw.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return t("name_invalid_words");
    return null;
  };
  const validatePhone = (raw) => {
    const digits = raw.trim().replace(/\s+/g, "");
    if (!/^\d+$/.test(digits)) return t("phone_invalid_digits");
    if (digits.length < 10) {
      const missing = 10 - digits.length;
      return `${t("phone_invalid_short")} ${missing.toLocaleString("en")} ${missing === 1 ? t("phone_invalid_digit_label") : t("phone_invalid_digits_label")}`;
    }
    if (digits.length > 10) {
      const extra = digits.length - 10;
      return `${t("phone_invalid_extra")} ${extra.toLocaleString("en")} ${extra === 1 ? t("phone_invalid_digit_label") : t("phone_invalid_digits_label")}`;
    }
    return null;
  };

  const addGuest = () => {
    if (!gName.trim() || !gPhone.trim()) {
      showToast(t("add_required_msg"));
      return;
    }
    const nameError = validateName(gName);
    if (nameError) { showToast(nameError); return; }
    const phoneError = validatePhone(gPhone);
    if (phoneError) { showToast(phoneError); return; }
    // Duplicate detection: by phone (primary) and by name (secondary) — scoped to current groom
    const normalizedPhone = gPhone.trim().replace(/\s+/g, "");
    const normalizedName  = gName.trim().toLowerCase();
    if (myGuests.some(g =>
        (g.phone || "").replace(/\s+/g, "") === normalizedPhone ||
        (g.name  || "").trim().toLowerCase() === normalizedName
    )) {
      showToast(t("add_duplicate_msg"));
      return;
    }
    const newGuest = {
      id: Date.now(),
      groomUsername: activeGroomUsername,
      name: gName.trim(),
      phone: gPhone.trim().replace(/\s+/g, ""),
      area: gArea.trim(),
      status: "pending",
      inviteType: gType,
    };
    setGuests(prev => [...prev, newGuest]);
    setGName(""); setGPhone(""); setGArea(""); setGType("premium");
    showToast(t("add_success"));
  };

  const removeGuest = (id) => {
    setGuests(prev => prev.filter(g => g.id !== id));
    showToast(t("delete_success"));
  };

  // Edit guest
  const startEdit = (g) => {
    setEditingGuest(g);
    setEName(g.name); setEPhone(g.phone); setEArea(g.area || ""); setEType(g.inviteType);
  };
  const cancelEdit = () => setEditingGuest(null);
  const saveEdit = () => {
    if (!eName.trim() || !ePhone.trim()) { showToast(t("add_required_msg")); return; }
    const nameError = validateName(eName);
    if (nameError) { showToast(nameError); return; }
    const phoneError = validatePhone(ePhone);
    if (phoneError) { showToast(phoneError); return; }
    setGuests(prev => prev.map(g => g.id === editingGuest.id ? {
      ...g, name: eName.trim(), phone: ePhone.trim().replace(/\s+/g, ""), area: eArea.trim(), inviteType: eType,
    } : g));
    setEditingGuest(null);
    showToast(t("edit_success"));
  };

  // Admin: user management
  const addUser = () => {
    if (!newUserName.trim() || !newUserPass.trim()) { showToast(t("admin_required")); return; }
    if (users.some(u => u.username === newUserName.trim()) || newUserName.trim() === "admin") {
      showToast(t("admin_taken")); return;
    }
    setUsers(prev => [...prev, {
      id: Date.now(), role: newUserRole,
      username: newUserName.trim(), password: newUserPass.trim(),
    }]);
    setNewUserName(""); setNewUserPass("");
    showToast(t("admin_added"));
  };
  const deleteUser = (id) => {
    setUsers(prev => prev.filter(u => u.id !== id));
    showToast(t("admin_deleted"));
  };

  // ── Driver: ask the browser for GPS permission, then start watchPosition ──
  // Permission is auto-prompted by the browser on the first call; we keep a
  // watchPosition open for the lifetime of the broadcast for smooth updates,
  // and ALSO push the latest fix to localStorage every 1s for grooms to read.
  const startDriverWatch = () => {
    setDriverGeoError(null);
    if (!("geolocation" in navigator)) {
      setDriverGeoError(t("geo_not_supported"));
      setDriverGeoPermission("denied");
      return;
    }
    // Stop any previous watch first (defensive)
    if (driverWatchIdRef.current != null) {
      navigator.geolocation.clearWatch(driverWatchIdRef.current);
      driverWatchIdRef.current = null;
    }
    driverWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setDriverGeoPermission("granted");
        setDriverGeoError(null);
        const fix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 0),
        };
        driverCoordsRef.current = fix;
        setDriverCoords(fix);
      },
      (err) => {
        setDriverGeoPermission(err.code === 1 ? "denied" : "denied");
        setDriverGeoError(err.code === 1 ? t("geo_denied") : (err.message || t("geo_denied")));
        if (driverWatchIdRef.current != null) {
          navigator.geolocation.clearWatch(driverWatchIdRef.current);
          driverWatchIdRef.current = null;
        }
        setDriverIsSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 12000 }
    );
  };

  // Start broadcasting (driver pressed "Start sharing")
  const saveLiveLocation = () => {
    if (liveShareWith.length === 0) { showToast(t("geo_pick_grooms_first")); return; }
    if (!currentUsername) return;
    setDriverIsSharing(true);
    startDriverWatch();
  };

  // Stop broadcasting (driver pressed "Stop sharing")
  const stopLiveLocation = () => {
    if (driverWatchIdRef.current != null) {
      navigator.geolocation.clearWatch(driverWatchIdRef.current);
      driverWatchIdRef.current = null;
    }
    setDriverIsSharing(false);
    setDriverCoords(null);
    driverCoordsRef.current = null;
    if (currentUsername) {
      setLiveLocations(prev => {
        const next = { ...prev };
        delete next[currentUsername];
        return next;
      });
    }
    setLiveShareWith([]);
    showToast(t("share_stopped"));
  };

  // While the driver is sharing, push their latest fix to localStorage every 1s
  // so all grooms watching see fresh data. Uses a ref to avoid restarting the
  // interval on every coord change.
  useEffect(() => {
    if (userType !== "driver" || !driverIsSharing || !currentUsername) return;
    const tick = () => {
      const fix = driverCoordsRef.current;
      if (!fix) return;
      setLiveLocations(prev => ({
        ...prev,
        [currentUsername]: {
          lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy,
          timeISO: new Date().toISOString(),
          shareWith: [...liveShareWith],
        },
      }));
    };
    tick(); // push immediately so grooms see something the first second
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [userType, driverIsSharing, currentUsername, liveShareWith]);

  // Cleanup any open watch when GroomPortal unmounts
  useEffect(() => () => {
    if (driverWatchIdRef.current != null) navigator.geolocation.clearWatch(driverWatchIdRef.current);
    if (groomWatchIdRef.current  != null) navigator.geolocation.clearWatch(groomWatchIdRef.current);
  }, []);

  // ── Groom: ask the browser for GPS permission, then start watchPosition ──
  const requestGroomLocation = () => {
    setGroomGeoError(null);
    if (!("geolocation" in navigator)) {
      setGroomGeoError(t("geo_not_supported"));
      setGroomGeoPermission("denied");
      return;
    }
    if (groomWatchIdRef.current != null) {
      navigator.geolocation.clearWatch(groomWatchIdRef.current);
      groomWatchIdRef.current = null;
    }
    groomWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGroomGeoPermission("granted");
        setGroomGeoError(null);
        setGroomCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy || 0),
        });
      },
      (err) => {
        setGroomGeoPermission("denied");
        setGroomGeoError(err.code === 1 ? t("geo_denied") : (err.message || t("geo_denied")));
        if (groomWatchIdRef.current != null) {
          navigator.geolocation.clearWatch(groomWatchIdRef.current);
          groomWatchIdRef.current = null;
        }
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 12000 }
    );
  };

  // Every second: bump a tick + re-read liveLocations from localStorage so the
  // groom sees driver positions update in near-real-time even across tabs.
  // We compare via a ref so the comparator sees the freshest state, not a stale closure.
  const liveLocationsRef = useRef(liveLocations);
  useEffect(() => { liveLocationsRef.current = liveLocations; }, [liveLocations]);
  useEffect(() => {
    if (userType !== "groom") return;
    const id = setInterval(() => {
      setNowTick(n => n + 1);
      try {
        const raw = localStorage.getItem("dawa_live_locations");
        if (!raw) return;
        const fresh = JSON.parse(raw) || {};
        const cur = liveLocationsRef.current || {};
        let changed = false;
        const keys = new Set([...Object.keys(fresh), ...Object.keys(cur)]);
        for (const k of keys) {
          if ((fresh[k]?.timeISO) !== (cur[k]?.timeISO)) { changed = true; break; }
        }
        if (changed) setLiveLocations(fresh);
      } catch {}
    }, 1000);
    return () => clearInterval(id);
  }, [userType]);

  // Convenience accessors
  const myLiveLocation = currentUsername ? liveLocations[currentUsername] : null;
  const driversSharingWithMe = useMemo(() => {
    if (userType !== "groom" || !currentUsername) return [];
    // A driver is considered "live" only if their last fix is within 30 seconds.
    // Beyond that we treat them as disconnected so their pin doesn't ghost on the map.
    const STALE_MS = 30 * 1000;
    const now = Date.now();
    return Object.entries(liveLocations)
      .filter(([_, info]) => {
        if (!Array.isArray(info?.shareWith)) return false;
        if (!info.shareWith.includes(currentUsername)) return false;
        if (typeof info.lat !== "number" || typeof info.lng !== "number") return false;
        const ts = info.timeISO ? Date.parse(info.timeISO) : 0;
        return ts && (now - ts) <= STALE_MS;
      })
  }, [liveLocations, currentUsername, userType, nowTick]);

  // Build the marker set for the LiveMap (groom's own + every driver sharing with them)
  const groomMapMarkers = useMemo(() => {
    const out = [];
    if (groomCoords) {
      out.push({
        key: `__you__`,
        lat: groomCoords.lat, lng: groomCoords.lng,
        kind: "you",
        label: t("map_you"),
      });
    }
    for (const d of driversSharingWithMe) {
      out.push({
        key: `drv_${d.driver}`,
        lat: d.lat, lng: d.lng,
        kind: "driver",
        label: `${t("map_driver")} · ${d.driver}`,
      });
    }
    return out;
  }, [groomCoords, driversSharingWithMe, t]);

  // ── Per-guest confirmation status (used to colour cards in admin "send" tab) ──
  // Returns null (no confirmation yet), "matched" (everything lines up), or
  // an object { status: "mismatch", reasons: [...] } when something disagrees.
  const guestConfirmationStatus = (guest) => {
    if (!guest) return null;
    const guestPhoneDigits = (guest.phone || "").replace(/\D/g, "");
    if (!guestPhoneDigits) return null;
    // Find a confirmation whose phone matches AND that is for this groom
    const conf = confirmations.find(c =>
      c.groomUsername === guest.groomUsername &&
      (c.submittedPhone || "").replace(/\D/g, "") === guestPhoneDigits
    );
    if (!conf) return null;
    const reasons = [];
    // Name validation: at least 2 words; AND case-insensitive match to guest.name
    const submittedName = (conf.submittedName || "").trim();
    const words = submittedName.split(/\s+/).filter(Boolean);
    if (words.length < 2) reasons.push(t("conf_mismatch_invalid_name"));
    else if (submittedName.toLowerCase() !== (guest.name || "").trim().toLowerCase()) {
      reasons.push(t("conf_mismatch_name"));
    }
    // Phone validation: exactly 10 digits
    if (guestPhoneDigits.length !== 10) reasons.push(t("conf_mismatch_invalid_phone"));
    // City comparison (only if groom recorded a city)
    const groomCity = (guest.area || "").split(/[-،,]/)[0].trim().toLowerCase();
    const guestCity = (conf.submittedCity || "").trim().toLowerCase();
    if (groomCity && guestCity && groomCity !== guestCity) reasons.push(t("conf_mismatch_city"));
    return reasons.length === 0
      ? { status: "matched", conf }
      : { status: "mismatch", reasons, conf };
  };

  const markDelivered = (id) => {
    const time = new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
    setGuests(prev => prev.map(g => g.id === id ? {
      ...g, status: "delivered",
      // Store the actual image data URL when a photo was captured, fallback to emoji marker
      proofImg: photoData || (photoTaken ? "📸" : undefined),
      deliveredAt: time,
      deliveredBy: lang === "he" ? "השליח (אתה)" : "المرسل (أنت)",
      deliveryNote: deliveryNote.trim() || undefined,
    } : g));
    setActiveId(null); setPhotoTaken(false); setPhotoData(null); setDeliveryNote("");
    showToast(t("driver_confirm"));
  };

  const wazeLink = (area) => `https://waze.com/ul?q=${encodeURIComponent(area)}&navigate=yes`;
  const telLink  = (phone) => `tel:${phone.replace(/\s+/g, "")}`;

  if (!authed) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 400, animation: "fadeUp .4s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: "#7a6a4a", cursor: "pointer", fontSize: 13 }}>
            {t("login_back")}
          </button>
          <LangSwitcher lang={lang} setLang={setLang} />
        </div>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <BrandLogo size={62} />
          </div>
          <h1 style={{ fontFamily: "'Amiri',serif", color: "#c9a84c", fontSize: 26, marginBottom: 6 }}>{t("login_title")}</h1>
          <p style={{ color: "#7a6a4a", fontSize: 13 }}>{t("login_subtitle")}</p>
        </div>
        <div className="gold-card" style={{ padding: 28 }}>
          <div style={{ marginBottom: 10, fontSize: 13, color: "#a09070" }}>{t("login_user")}</div>
          <input className="input-field" type="text" placeholder={t("login_user")}
                 value={loginUser} onChange={e => { setLoginUser(e.target.value); setLoginError(""); }}
                 style={{ marginBottom: 14 }}/>
          <div style={{ marginBottom: 10, fontSize: 13, color: "#a09070" }}>{t("login_pass")}</div>
          <input className="input-field" type="password" placeholder="••••••"
                 value={loginPass} onChange={e => { setLoginPass(e.target.value); setLoginError(""); }}
                 onKeyDown={e => e.key === "Enter" && handleLogin()}
                 style={{ marginBottom: 12 }}/>
          {loginError && <div style={{ color: "#d47a4b", fontSize: 12, marginBottom: 12 }}>{loginError}</div>}
          <button className="gold-btn" style={{ width: "100%" }} onClick={handleLogin}>
            {t("login_submit")}
          </button>
          <div style={{ marginTop: 18, padding: "12px 14px", borderRadius: 10,
            background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)",
            textAlign: "center", color: "#7a6a4a", fontSize: 12, lineHeight: 1.9 }}>
            {t("login_hint")}
          </div>
        </div>
      </div>
    </div>
  );

  /* ─────────────── ADMIN (المدير — مخفية) VIEW ─────────────── */
  if (userType === "admin") {
    return (
      <div style={{ minHeight: "100vh", background: "#07070a" }}>
        {toast && (
          <div style={{
            position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
            background: "#1a1200", border: "1px solid #c9a84c88", borderRadius: 14,
            padding: "12px 24px", color: "#f5e6b8", fontWeight: 700, zIndex: 999,
            animation: "fadeUp .3s ease", whiteSpace: "nowrap",
          }}>{toast}</div>
        )}
        <div style={{
          position: "sticky", top: 0, zIndex: 50, background: "rgba(7,7,10,.95)",
          backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(201,168,76,.18)", padding: "0 16px",
        }}>
          <div style={{ maxWidth: 720, margin: "0 auto", height: 54, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={onBack} style={{ background: "none", border: "none", color: "#7a6a4a", cursor: "pointer", fontSize: 16 }}>←</button>
              <span style={{ fontSize: 20 }}>🔒</span>
              <span style={{ fontFamily: "'Amiri',serif", color: "#c9a84c", fontWeight: 900, fontSize: 17 }}>{t("admin_title")}</span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <LangSwitcher lang={lang} setLang={setLang} />
              <button onClick={() => setLogoutAsking(true)} title={t("logout")} style={{
                background: "rgba(212,80,58,.08)", border: "1px solid rgba(212,80,58,.3)",
                color: "#d47a4b", padding: "5px 10px", borderRadius: 8,
                fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>↩ {t("logout")}</button>
            </div>
          </div>
        </div>
        {logoutAsking && <LogoutConfirm t={t} onConfirm={doLogout} onCancel={() => setLogoutAsking(false)}/>}

        <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 80px" }}>
          <div className="gold-card" style={{ marginBottom: 18, padding: "14px 18px",
            background: "rgba(255,180,80,.06)", border: "1px solid rgba(255,180,80,.2)" }}>
            <div style={{ fontSize: 12, color: "#f0c84c", fontWeight: 700 }}>⚠ {t("admin_warning")}</div>
          </div>

          {/* Admin sub-tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
            {[
              ["users",         "👥 " + t("admin_tab_users")],
              ["send",          "📨 " + t("admin_tab_send")],
              ["confirmations", "✓ " + t("admin_tab_confirmations") + (confirmations.length ? ` (${confirmations.length})` : "")],
              ["settings",      "⚙ " + t("admin_tab_settings")],
            ].map(([id, lbl]) => (
              <button key={id} onClick={() => setAdminTab(id)} style={{
                flex: "1 1 140px", padding: "10px 0", borderRadius: 10, cursor: "pointer",
                background: adminTab === id ? "rgba(201,168,76,.18)" : "rgba(255,255,255,.04)",
                border: `1px solid ${adminTab === id ? "rgba(201,168,76,.4)" : "rgba(255,255,255,.08)"}`,
                color: adminTab === id ? "#c9a84c" : "#7a6a4a",
                fontSize: 12, fontWeight: 800, fontFamily: "inherit", transition: "all .2s",
              }}>{lbl}</button>
            ))}
          </div>

          {/* ── USERS TAB (existing functionality) ── */}
          {adminTab === "users" && (<>
            <div style={{ fontSize: 21, fontWeight: 900, color: "#f5e6b8", marginBottom: 4 }}>{t("admin_title")}</div>
            <div style={{ fontSize: 13, color: "#7a6a4a", marginBottom: 20 }}>{t("admin_subtitle")}</div>

            <div className="gold-card" style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#c9a84c", marginBottom: 14 }}>
                {t("admin_add_user")}
              </div>
              <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("admin_role")}</div>
              <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                {[
                  { val: "groom",  lbl: t("admin_role_groom"),  color: "#c9a84c" },
                  { val: "driver", lbl: t("admin_role_driver"), color: "#4b9fd4" },
                ].map(opt => (
                  <button key={opt.val} onClick={() => setNewUserRole(opt.val)} style={{
                    flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer",
                    background: newUserRole === opt.val ? `${opt.color}22` : "rgba(255,255,255,.04)",
                    border: `1.5px solid ${newUserRole === opt.val ? opt.color : "rgba(255,255,255,.08)"}`,
                    color: newUserRole === opt.val ? opt.color : "#7a6a4a",
                    fontWeight: 800, fontSize: 13, fontFamily: "inherit",
                  }}>{opt.lbl}</button>
                ))}
              </div>
              <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("login_user")}</div>
              <input className="input-field" type="text" placeholder={t("login_user")}
                     value={newUserName} onChange={e => setNewUserName(e.target.value)}
                     style={{ marginBottom: 12, direction: "ltr", textAlign: "right" }}/>
              <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("login_pass")}</div>
              <input className="input-field" type="text" placeholder="••••••"
                     value={newUserPass} onChange={e => setNewUserPass(e.target.value)}
                     style={{ marginBottom: 16, direction: "ltr", textAlign: "right" }}/>
              <button className="gold-btn" style={{ width: "100%" }} onClick={addUser}
                      disabled={!newUserName.trim() || !newUserPass.trim()}>
                ➕ {t("admin_create")}
              </button>
            </div>

            <div style={{ fontSize: 13, color: "#7a6a4a", fontWeight: 700, marginBottom: 10 }}>
              {t("admin_existing")} ({users.length.toLocaleString("en")})
            </div>
            {users.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 32, color: "#7a6a4a" }}>
                {t("admin_no_users")}
              </div>
            ) : (
              users.map(u => (
                <div key={u.id} className="card" style={{
                  marginBottom: 10, display: "flex", alignItems: "center", gap: 12,
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: u.role === "driver" ? "rgba(75,159,212,.15)" : "rgba(201,168,76,.15)",
                    color: u.role === "driver" ? "#4b9fd4" : "#c9a84c",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 18, fontWeight: 900,
                  }}>{u.role === "driver" ? "🚗" : "♥"}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, color: "#f5e6b8", fontSize: 14, direction: "ltr", textAlign: "right" }}>{u.username}</div>
                    <div style={{ fontSize: 11, color: "#7a6a4a", marginTop: 2 }}>
                      {u.role === "driver" ? t("admin_role_driver") : t("admin_role_groom")} · <span style={{ direction: "ltr" }}>🔑 {u.password}</span>
                    </div>
                  </div>
                  <button onClick={() => deleteUser(u.id)} style={{
                    background: "rgba(212,122,75,.12)", border: "1px solid rgba(212,122,75,.3)",
                    color: "#d47a4b", padding: "6px 12px", borderRadius: 8,
                    fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                  }}>{t("admin_delete")}</button>
                </div>
              ))
            )}
          </>)}

          {/* ── SEND INVITATIONS TAB ── */}
          {adminTab === "send" && (() => {
            const groomList = users.filter(u => u.role === "groom");
            const selectedGroomGuests = adminSelectedGroom
              ? guests.filter(g => g.groomUsername === adminSelectedGroom) : [];
            const withoutAddr = selectedGroomGuests.filter(g => !g.area || !g.area.trim());
            const withAddr    = selectedGroomGuests.filter(g =>  g.area &&  g.area.trim());

            return (
              <div>
                <div style={{ fontSize: 19, fontWeight: 900, color: "#c9a84c", fontFamily: "'Amiri',serif", marginBottom: 4 }}>
                  📨 {t("admin_tab_send")}
                </div>
                <div style={{ fontSize: 12, color: "#7a6a4a", marginBottom: 16 }}>
                  {t("admin_send_hint")}
                </div>

                {!adminFormLink.trim() && (
                  <div style={{
                    marginBottom: 16, padding: "12px 14px", borderRadius: 10,
                    background: "rgba(212,122,75,.08)", border: "1px solid rgba(212,122,75,.3)",
                    fontSize: 12, color: "#d47a4b", lineHeight: 1.7,
                  }}>
                    ⚠ {lang === "he" ? "אנא הגדר את קישור טופס האישור בלשונית הגדרות תחילה" : "يرجى ضبط رابط نموذج التأكيد من تبويب الإعدادات أولاً"}
                  </div>
                )}

                {/* Groom selector */}
                <div style={{ fontSize: 12, color: "#a09070", fontWeight: 700, marginBottom: 8 }}>
                  {t("admin_select_groom")}
                </div>
                {groomList.length === 0 ? (
                  <div className="card" style={{ textAlign: "center", padding: 24, color: "#7a6a4a" }}>
                    {t("admin_no_grooms")}
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 18 }}>
                    {groomList.map(u => {
                      const count = guests.filter(g => g.groomUsername === u.username).length;
                      const isSel = adminSelectedGroom === u.username;
                      return (
                        <button key={u.id} onClick={() => setAdminSelectedGroom(isSel ? null : u.username)} style={{
                          padding: "12px 10px", borderRadius: 12, cursor: "pointer",
                          background: isSel ? "rgba(201,168,76,.22)" : "rgba(255,255,255,.03)",
                          border: `1.5px solid ${isSel ? "#c9a84c" : "rgba(255,255,255,.08)"}`,
                          color: isSel ? "#c9a84c" : "#a09070",
                          fontWeight: 800, fontSize: 13, fontFamily: "inherit",
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                        }}>
                          <span style={{ fontSize: 22 }}>{isSel ? "✓" : "♥"}</span>
                          <span style={{ direction: "ltr" }}>{u.username}</span>
                          <span style={{ fontSize: 10, color: "#7a6a4a" }}>
                            {t("admin_groom_guests_count")} {count.toLocaleString("en")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Guests of selected groom + send buttons */}
                {adminSelectedGroom && (
                  <>
                    {selectedGroomGuests.length > 0 && (
                      <button onClick={() => sendWaToAll(adminSelectedGroom)}
                              disabled={!adminFormLink.trim()}
                              style={{
                                width: "100%", padding: "13px 0", borderRadius: 12, cursor: adminFormLink.trim() ? "pointer" : "not-allowed",
                                background: adminFormLink.trim() ? "linear-gradient(135deg,#25d366,#1ea84d)" : "rgba(255,255,255,.05)",
                                color: adminFormLink.trim() ? "#fff" : "#5a5040",
                                border: "none", fontWeight: 900, fontSize: 14, fontFamily: "inherit", marginBottom: 18,
                              }}>
                        {t("admin_send_to_all")} ({selectedGroomGuests.length.toLocaleString("en")})
                      </button>
                    )}

                    {selectedGroomGuests.length === 0 && (
                      <div className="card" style={{ textAlign: "center", padding: 24, color: "#7a6a4a" }}>
                        {t("guests_empty")}
                      </div>
                    )}

                    {[
                      { title: t("guests_without_address"), list: withoutAddr, color: "#d47a4b", bg: "rgba(212,122,75,.06)" },
                      { title: t("guests_with_address"),    list: withAddr,    color: "#4cc97a", bg: "rgba(76,201,122,.06)" },
                    ].filter(s => s.list.length > 0).map(sec => (
                      <div key={sec.title}>
                        <div style={{
                          display: "flex", alignItems: "center", gap: 10,
                          marginTop: 10, marginBottom: 8, padding: "8px 12px", borderRadius: 10,
                          background: sec.bg, border: `1px solid ${sec.color}33`,
                        }}>
                          <div style={{ flex: 1, fontWeight: 800, color: sec.color, fontSize: 13 }}>{sec.title}</div>
                          <span style={{ fontSize: 11, color: sec.color, fontWeight: 700 }}>{sec.list.length.toLocaleString("en")}</span>
                        </div>
                        {sec.list.map(g => {
                          // Phone-match-based confirmation status. Softly tinted card +
                          // small badge when there's a mismatch or a clean match.
                          const confStatus = guestConfirmationStatus(g);
                          const isMatched   = confStatus?.status === "matched";
                          const isMismatch  = confStatus?.status === "mismatch";
                          // Soft tints — gentle red for mismatch, soft green for matched,
                          // neutral when no confirmation yet.
                          const cardBg     = isMismatch ? "rgba(212,122,75,.07)"
                                            : isMatched ? "rgba(76,201,122,.05)"
                                            : "rgba(255,255,255,.03)";
                          const cardBorder = isMismatch ? "rgba(212,122,75,.4)"
                                            : isMatched ? "rgba(76,201,122,.3)"
                                            : "rgba(255,255,255,.07)";
                          return (
                          <div key={g.id} style={{
                            background: cardBg,
                            border: `1px solid ${cardBorder}`,
                            borderRadius: 14, padding: 14,
                            marginBottom: 8, display: "flex", alignItems: "center", gap: 10,
                            transition: "background .2s, border-color .2s",
                            position: "relative",
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <span style={{ fontWeight: 800, color: "#f5e6b8", fontSize: 14 }}>{g.name}</span>
                                {/* Tiny status pill — matched (green) or mismatch (soft red) */}
                                {isMatched && (
                                  <span style={{
                                    fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 700,
                                    background: "rgba(76,201,122,.15)", color: "#4cc97a",
                                  }}>{t("conf_status_matched")}</span>
                                )}
                                {isMismatch && (
                                  <span style={{
                                    fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 700,
                                    background: "rgba(212,122,75,.18)", color: "#d47a4b",
                                  }}>{t("conf_status_mismatch")}</span>
                                )}
                              </div>
                              <div style={{ fontSize: 11, color: "#5a5040", direction: "ltr", textAlign: "right" }}>{g.phone}</div>
                              {g.area && <div style={{ fontSize: 11, color: "#7a6a4a" }}>📍 {g.area}</div>}
                              {/* Explain what's mismatched — without shouting */}
                              {isMismatch && (
                                <div style={{
                                  marginTop: 6, padding: "6px 10px", borderRadius: 8,
                                  background: "rgba(212,122,75,.07)",
                                  border: "1px solid rgba(212,122,75,.18)",
                                  fontSize: 10, color: "#d47a4b", lineHeight: 1.6,
                                }}>
                                  {confStatus.reasons.join(" · ")}
                                </div>
                              )}
                            </div>
                            <button onClick={() => sendWaToOne(g.phone)}
                                    disabled={!adminFormLink.trim()}
                                    style={{
                                      padding: "8px 14px", borderRadius: 10, border: "none",
                                      background: adminFormLink.trim() ? "linear-gradient(135deg,#25d366,#1ea84d)" : "rgba(255,255,255,.05)",
                                      color: adminFormLink.trim() ? "#fff" : "#5a5040",
                                      fontSize: 12, fontWeight: 800, fontFamily: "inherit",
                                      cursor: adminFormLink.trim() ? "pointer" : "not-allowed",
                                      alignSelf: "center",
                                    }}>
                              {t("admin_send_to_one")}
                            </button>
                          </div>
                          );
                        })}
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })()}

          {/* ── SETTINGS TAB ── */}
          {adminTab === "settings" && (
            <div>
              <div style={{ fontSize: 19, fontWeight: 900, color: "#c9a84c", fontFamily: "'Amiri',serif", marginBottom: 4 }}>
                ⚙ {t("admin_settings_title")}
              </div>
              <div style={{ fontSize: 12, color: "#7a6a4a", marginBottom: 16 }}>
                {t("admin_settings_subtitle")}
              </div>

              <div className="gold-card">
                <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("admin_form_link")}</div>
                <input className="input-field" type="url" placeholder={t("admin_form_link_placeholder")}
                       value={adminFormLink} onChange={e => setAdminFormLink(e.target.value)}
                       style={{ marginBottom: 16, direction: "ltr", textAlign: "right", fontSize: 12 }}/>

                <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("admin_msg_body")}</div>
                <textarea className="input-field"
                          placeholder={t("admin_msg_placeholder")}
                          value={adminMessageBody}
                          onChange={e => setAdminMessageBody(e.target.value)}
                          rows={8}
                          style={{ marginBottom: 16, fontSize: 13, resize: "vertical", fontFamily: "inherit" }}/>

                <button className="gold-btn" style={{ width: "100%" }}
                        onClick={() => showToast(t("admin_settings_saved"))}>
                  {t("admin_save_settings")}
                </button>
              </div>
            </div>
          )}

          {/* ── CONFIRMATIONS TAB ── */}
          {adminTab === "confirmations" && (() => {
            const matched   = confirmations.filter(c => matchColor(c) === "green");
            const mismatch  = confirmations.filter(c => matchColor(c) === "red" && matchedGuestFor(c));
            const unknown   = confirmations.filter(c => !matchedGuestFor(c));

            const renderConf = (conf) => {
              const guest = matchedGuestFor(conf);
              const color = matchColor(conf);
              const borderColor = color === "green" ? "rgba(76,201,122,.5)" : "rgba(212,122,75,.45)";
              const bgColor     = color === "green" ? "rgba(76,201,122,.05)" : "rgba(212,122,75,.06)";
              // Compute the human-readable mismatch reasons (used when guest is matched
              // by phone but other fields disagree). For unknown-phone confirmations,
              // there's no guest, so no reasons list to show.
              const status = guest ? guestConfirmationStatus(guest) : null;
              const reasons = (status && status.status === "mismatch") ? status.reasons : [];
              return (
                <div key={conf.id} style={{
                  marginBottom: 12, padding: 14, borderRadius: 14,
                  background: bgColor, border: `1.5px solid ${borderColor}`,
                  boxShadow: color === "red" ? "0 0 0 1px rgba(212,122,75,.08) inset" : "none",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: "#7a6a4a" }}>
                      {t("admin_conf_for_groom")} <span style={{ color: "#c9a84c", fontWeight: 700, direction: "ltr" }}>{conf.groomUsername}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#5a5040" }}>
                      {new Date(conf.confirmedAt).toLocaleString(lang === "he" ? "he-IL" : "ar")}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: guest ? "1fr 1fr" : "1fr", gap: 10 }}>
                    {guest && (
                      <div style={{ padding: 10, background: "rgba(255,255,255,.03)", borderRadius: 8 }}>
                        <div style={{ fontSize: 10, color: "#7a6a4a", fontWeight: 700, marginBottom: 4 }}>
                          {t("admin_conf_from_groom")}
                        </div>
                        <div style={{ fontSize: 13, color: "#f5e6b8", fontWeight: 800 }}>{guest.name}</div>
                        <div style={{ fontSize: 11, color: "#a09070", direction: "ltr", textAlign: "right" }}>{guest.phone}</div>
                        <div style={{ fontSize: 11, color: "#7a6a4a", marginTop: 4 }}>
                          📍 {guest.area || t("admin_conf_no_address")}
                        </div>
                      </div>
                    )}
                    <div style={{ padding: 10, background: "rgba(255,255,255,.03)", borderRadius: 8 }}>
                      <div style={{ fontSize: 10, color: "#7a6a4a", fontWeight: 700, marginBottom: 4 }}>
                        {t("admin_conf_from_guest")}
                      </div>
                      <div style={{ fontSize: 13, color: "#f5e6b8", fontWeight: 800 }}>{conf.submittedName}</div>
                      <div style={{ fontSize: 11, color: "#a09070", direction: "ltr", textAlign: "right" }}>{conf.submittedPhone}</div>
                      <div style={{ fontSize: 11, color: "#7a6a4a", marginTop: 4 }}>
                        📍 {[conf.submittedCity, conf.submittedStreet, conf.submittedHouse].filter(Boolean).join("، ") || t("admin_conf_no_address")}
                      </div>
                    </div>
                  </div>

                  {/* Show *which* fields disagree, so the admin can fix the guest list (or trust the guest) at a glance */}
                  {reasons.length > 0 && (
                    <div style={{
                      marginTop: 10, padding: "8px 12px", borderRadius: 8,
                      background: "rgba(212,122,75,.07)", border: "1px solid rgba(212,122,75,.22)",
                      fontSize: 11, color: "#d47a4b", lineHeight: 1.7, display: "flex",
                      flexWrap: "wrap", gap: 8, alignItems: "center",
                    }}>
                      <span style={{ fontWeight: 800 }}>⚠</span>
                      {reasons.map((r, i) => (
                        <span key={i} style={{
                          padding: "2px 8px", borderRadius: 12,
                          background: "rgba(212,122,75,.14)", border: "1px solid rgba(212,122,75,.3)",
                          fontWeight: 700,
                        }}>{r}</span>
                      ))}
                    </div>
                  )}

                  {guest && (
                    <button onClick={() => useConfirmationData(conf)} style={{
                      marginTop: 10, width: "100%", padding: 9, borderRadius: 8,
                      background: "rgba(201,168,76,.15)", border: "1px solid rgba(201,168,76,.35)",
                      color: "#c9a84c", fontSize: 12, fontWeight: 800,
                      cursor: "pointer", fontFamily: "inherit",
                    }}>
                      💾 {t("admin_conf_use_guest_data")}
                    </button>
                  )}
                </div>
              );
            };

            return (
              <div>
                <div style={{ fontSize: 19, fontWeight: 900, color: "#c9a84c", fontFamily: "'Amiri',serif", marginBottom: 4 }}>
                  ✓ {t("admin_conf_title")}
                </div>
                <div style={{ fontSize: 12, color: "#7a6a4a", marginBottom: 16 }}>
                  {t("admin_conf_subtitle")}
                </div>

                {confirmations.length === 0 ? (
                  <div className="card" style={{ textAlign: "center", padding: 32, color: "#7a6a4a" }}>
                    {t("admin_conf_empty")}
                  </div>
                ) : (
                  <>
                    {matched.length > 0 && (
                      <div style={{ marginBottom: 18 }}>
                        <div style={{ fontSize: 13, color: "#4cc97a", fontWeight: 700, marginBottom: 10 }}>
                          {t("admin_conf_matched")} ({matched.length.toLocaleString("en")})
                        </div>
                        {matched.map(renderConf)}
                      </div>
                    )}
                    {mismatch.length > 0 && (
                      <div style={{ marginBottom: 18 }}>
                        <div style={{ fontSize: 13, color: "#d47a4b", fontWeight: 700, marginBottom: 10 }}>
                          ⚠ {lang === "he" ? "פרטים שונים" : "بيانات مختلفة"} ({mismatch.length.toLocaleString("en")})
                        </div>
                        {mismatch.map(renderConf)}
                      </div>
                    )}
                    {unknown.length > 0 && (
                      <div>
                        <div style={{ fontSize: 13, color: "#d47a4b", fontWeight: 700, marginBottom: 10 }}>
                          {t("admin_conf_unknown")} ({unknown.length.toLocaleString("en")})
                        </div>
                        {unknown.map(renderConf)}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  /* ─────────────── DISTRIBUTOR (المرسل) VIEW ─────────────── */
  if (userType === "driver") {
    // ── Pick-groom screen: required before showing the dashboard ──
    if (!driverServingGroom) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ width: "100%", maxWidth: 420, animation: "fadeUp .4s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <button onClick={() => setLogoutAsking(true)} style={{
                background: "rgba(212,80,58,.08)", border: "1px solid rgba(212,80,58,.3)",
                color: "#d47a4b", padding: "6px 12px", borderRadius: 8,
                fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>↩ {t("logout")}</button>
              <LangSwitcher lang={lang} setLang={setLang} />
            </div>
            <div style={{ textAlign: "center", marginBottom: 22 }}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>🚗</div>
              <h1 style={{ fontFamily: "'Amiri',serif", color: "#4b9fd4", fontSize: 24, marginBottom: 6 }}>
                {t("driver_pick_groom_title")}
              </h1>
              <p style={{ color: "#7a6a4a", fontSize: 13, lineHeight: 1.7, maxWidth: 360, margin: "0 auto" }}>
                {t("driver_pick_groom_subtitle")}
              </p>
            </div>
            <div className="gold-card" style={{ padding: 24,
              background: "rgba(75,159,212,.06)", border: "1px solid rgba(75,159,212,.22)" }}>
              <div style={{ marginBottom: 10, fontSize: 13, color: "#a09070" }}>{t("driver_pick_groom_field")}</div>
              <input className="input-field" type="text" placeholder="username"
                     value={driverGroomInput}
                     onChange={e => { setDriverGroomInput(e.target.value); setDriverGroomError(""); }}
                     onKeyDown={e => e.key === "Enter" && submitDriverGroom()}
                     style={{ marginBottom: 12, direction: "ltr", textAlign: "right" }}/>
              {driverGroomError && (
                <div style={{ color: "#d47a4b", fontSize: 12, marginBottom: 12 }}>{driverGroomError}</div>
              )}
              <button onClick={submitDriverGroom}
                      disabled={!driverGroomInput.trim()}
                      style={{
                        width: "100%", padding: 12, borderRadius: 10,
                        background: driverGroomInput.trim() ? "linear-gradient(135deg,#4b9fd4,#3a7fb0)" : "rgba(255,255,255,.05)",
                        color: driverGroomInput.trim() ? "#fff" : "#5a5040",
                        border: "none", fontWeight: 900, fontSize: 14, fontFamily: "inherit",
                        cursor: driverGroomInput.trim() ? "pointer" : "not-allowed",
                      }}>
                {t("driver_pick_groom_submit")}
              </button>
            </div>
          </div>
          {logoutAsking && <LogoutConfirm t={t} lang={lang} onConfirm={doLogout} onCancel={() => setLogoutAsking(false)}/>}
        </div>
      );
    }

    const pending = myGuests.filter(g => g.status !== "delivered");
    const done    = myGuests.filter(g => g.status === "delivered");
    const pct = myGuests.length ? Math.round(done.length / myGuests.length * 100) : 0;

    // Extract city/town from area string (text before first "-" or first comma)
    const extractCity = (area) => {
      if (!area) return lang === "he" ? "ללא כתובת" : "بدون عنوان";
      return area.split(/[-،,]/)[0].trim();
    };

    // Group pending guests by city, then sort within each city by area string
    // for rough proximity ordering (houses with similar street names tend to be close).
    const groupedPending = (() => {
      const map = new Map();
      for (const g of pending) {
        const city = extractCity(g.area);
        if (!map.has(city)) map.set(city, []);
        map.get(city).push(g);
      }
      const groups = [];
      for (const [city, list] of map.entries()) {
        list.sort((a, b) => (a.area || "").localeCompare(b.area || ""));
        groups.push({ city, list });
      }
      // Cities with most guests first (better route efficiency)
      groups.sort((a, b) => b.list.length - a.list.length);
      return groups;
    })();

    // Build a flat sequence so we can show overall ordinal number (1, 2, 3, …)
    const orderedSequence = groupedPending.flatMap(grp => grp.list);

    return (
      <div style={{ minHeight: "100vh", background: "#07070a" }}>
        {toast && (
          <div style={{
            position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
            background: "rgba(76,201,122,.15)", border: "1px solid rgba(76,201,122,.4)",
            borderRadius: 14, padding: "12px 24px", color: "#4cc97a",
            fontWeight: 700, zIndex: 999, animation: "fadeUp .3s ease", whiteSpace: "nowrap",
          }}>{toast}</div>
        )}

        {/* Header */}
        <div style={{
          position: "sticky", top: 0, zIndex: 50, background: "rgba(7,7,10,.95)",
          backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(75,159,212,.15)",
          padding: "12px 16px",
        }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <button onClick={onBack} style={{ background: "none", border: "none", color: "#7a6a4a", cursor: "pointer", fontSize: 16 }}>←</button>
              <div style={{ fontSize: 22 }}>🚗</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 900, color: "#4b9fd4", fontSize: 15 }}>{t("driver_title")}</div>
                <div style={{ fontSize: 10, color: "#5a5040", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {t("driver_serving_for")} <span style={{ color: "#c9a84c", fontWeight: 700 }}>{driverServingGroom}</span>
                </div>
              </div>
              <LangSwitcher lang={lang} setLang={setLang} />
              <button onClick={() => setLogoutAsking(true)} title={t("logout")} style={{
                background: "rgba(212,80,58,.08)", border: "1px solid rgba(212,80,58,.3)",
                color: "#d47a4b", padding: "5px 10px", borderRadius: 8,
                fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}>↩</button>
            </div>
            {/* Driver tabs */}
            <div style={{ display: "flex", gap: 6 }}>
              {[
                ["pending", "📋 " + t("driver_subtitle")],
                ["shared",  "🏘 " + t("tab_shared")],
              ].map(([id, lbl]) => (
                <button key={id} onClick={() => setTab(id)} style={{
                  flex: 1, padding: "8px 0", borderRadius: 10, cursor: "pointer",
                  background: tab === id ? "rgba(75,159,212,.18)" : "rgba(255,255,255,.04)",
                  border: `1px solid ${tab === id ? "rgba(75,159,212,.4)" : "rgba(255,255,255,.08)"}`,
                  color: tab === id ? "#4b9fd4" : "#7a6a4a",
                  fontSize: 12, fontWeight: 800, fontFamily: "inherit", transition: "all .2s",
                }}>{lbl}</button>
              ))}
              <button onClick={() => setDriverServingGroom(null)} title={t("driver_pick_groom_change")} style={{
                padding: "8px 12px", borderRadius: 10, cursor: "pointer",
                background: "rgba(201,168,76,.08)", border: "1px solid rgba(201,168,76,.25)",
                color: "#c9a84c", fontSize: 14, fontWeight: 800, fontFamily: "inherit",
              }}>⇄</button>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: "#4cc97a", textAlign: "left" }}>
              {done.length.toLocaleString("en")}/{myGuests.length.toLocaleString("en")} {t("driver_completed")}
            </div>
          </div>
        </div>

        {logoutAsking && <LogoutConfirm t={t} onConfirm={doLogout} onCancel={() => setLogoutAsking(false)}/>}

        <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 16px 80px" }}>
        {/* ─── TAB: PENDING (main route for the chosen groom) ─── */}
        {(tab === "pending" || tab !== "shared") && (<>
          {/* Progress bar */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ height: 8, background: "rgba(255,255,255,.05)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${pct}%`,
                background: "linear-gradient(90deg,#4b9fd4,#4cc97a)",
                borderRadius: 4, transition: "width .6s ease",
              }}/>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "#7a6a4a" }}>
              <span>{t("driver_remaining")} {pending.length.toLocaleString("en")}</span>
              <span style={{ color: "#c9a84c", fontWeight: 700 }}>{pct}%</span>
              <span>{t("driver_done")} {done.length.toLocaleString("en")}</span>
            </div>
          </div>

          {/* ── LIVE LOCATION SHARE (real-time GPS, per-driver, choose which grooms see it) ── */}
          {(() => {
            const groomUsers = users.filter(u => u.role === "groom");
            const toggleGroom = (uname) => setLiveShareWith(prev =>
              prev.includes(uname) ? prev.filter(x => x !== uname) : [...prev, uname]
            );
            const isActive = driverIsSharing && driverGeoPermission === "granted";
            const myStoredLoc = myLiveLocation; // freshness comes from the 1s push
            return (
              <div style={{
                marginBottom: 22, padding: 16, borderRadius: 14,
                background: isActive ? "rgba(76,201,122,.06)" : "rgba(75,159,212,.04)",
                border: `1px solid ${isActive ? "rgba(76,201,122,.25)" : "rgba(75,159,212,.18)"}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 18 }}>📡</span>
                  <div style={{ fontSize: 13, fontWeight: 800, color: isActive ? "#4cc97a" : "#4b9fd4" }}>
                    {t("share_section")}
                  </div>
                </div>

                {isActive ? (
                  /* ─── BROADCASTING ─── */
                  <>
                    <div style={{ fontSize: 12, color: "#4cc97a", fontWeight: 700, marginBottom: 4 }}>
                      {t("geo_share_active")}
                    </div>
                    <div style={{ fontSize: 11, color: "#7a6a4a", marginBottom: 8, lineHeight: 1.7 }}>
                      {t("share_active_with")}{" "}
                      <span style={{ color: "#c9a84c", fontWeight: 700, direction: "ltr" }}>
                        {(myStoredLoc?.shareWith || liveShareWith).join(", ")}
                      </span>
                    </div>

                    {/* Live coordinate + accuracy readout */}
                    {driverCoords && (
                      <div style={{
                        padding: "10px 12px", borderRadius: 10, marginBottom: 10,
                        background: "rgba(76,201,122,.05)", border: "1px solid rgba(76,201,122,.18)",
                        display: "flex", flexDirection: "column", gap: 4,
                      }}>
                        <div style={{ fontSize: 11, color: "#7a6a4a", direction: "ltr", textAlign: "right" }}>
                          📍 {driverCoords.lat.toFixed(5)}, {driverCoords.lng.toFixed(5)}
                        </div>
                        <div style={{ fontSize: 11, color: "#7a6a4a" }}>
                          {t("geo_accuracy")} ±{driverCoords.accuracy} {t("geo_meters")}
                        </div>
                        <div style={{ fontSize: 10, color: "#4cc97a", fontWeight: 700 }}>
                          {t("geo_updating")}
                        </div>
                      </div>
                    )}
                    <button onClick={stopLiveLocation} style={{
                      width: "100%", padding: "10px 0", borderRadius: 10, cursor: "pointer",
                      background: "rgba(212,122,75,.12)", border: "1px solid rgba(212,122,75,.3)",
                      color: "#d47a4b", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                    }}>{t("geo_share_stop")}</button>
                  </>
                ) : (
                  /* ─── NOT BROADCASTING — show permission flow + start button ─── */
                  <>
                    <div style={{
                      fontSize: 11, color: "#a09070", marginBottom: 12, lineHeight: 1.9,
                      padding: "10px 14px", borderRadius: 10,
                      background: "rgba(38,165,228,.06)", border: "1px solid rgba(38,165,228,.22)",
                      whiteSpace: "pre-line",
                    }}>
                      {t("geo_hint_new")}
                    </div>

                    {/* Permission denied message */}
                    {driverGeoPermission === "denied" && driverGeoError && (
                      <div style={{
                        padding: "10px 12px", borderRadius: 10, marginBottom: 12,
                        background: "rgba(212,122,75,.08)", border: "1px solid rgba(212,122,75,.3)",
                        fontSize: 12, color: "#d47a4b", lineHeight: 1.6,
                      }}>
                        ⚠ {driverGeoError}
                      </div>
                    )}

                    <div style={{ marginBottom: 6, fontSize: 11, color: "#7a6a4a", fontWeight: 700 }}>
                      {t("share_pick_grooms")}
                    </div>
                    {groomUsers.length === 0 ? (
                      <div style={{ padding: "10px 12px", borderRadius: 8, marginBottom: 12,
                        background: "rgba(255,255,255,.03)", color: "#5a5040", fontSize: 12, textAlign: "center" }}>
                        {t("share_no_grooms_yet")}
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                        {groomUsers.map(u => {
                          const isSel = liveShareWith.includes(u.username);
                          return (
                            <button key={u.id} onClick={() => toggleGroom(u.username)} style={{
                              padding: "6px 12px", borderRadius: 20, cursor: "pointer",
                              background: isSel ? "rgba(201,168,76,.2)" : "rgba(255,255,255,.04)",
                              border: `1.5px solid ${isSel ? "#c9a84c" : "rgba(255,255,255,.1)"}`,
                              color: isSel ? "#c9a84c" : "#7a6a4a",
                              fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                              display: "flex", alignItems: "center", gap: 6,
                            }}>
                              <span>{isSel ? "✓" : "○"}</span>
                              <span style={{ direction: "ltr" }}>{u.username}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* The single primary button. Label depends on permission state.
                        Pressing it FIRST triggers the browser permission prompt; if
                        granted, it kicks off the watch + the 1s push loop.        */}
                    <button onClick={saveLiveLocation}
                            disabled={liveShareWith.length === 0}
                            style={{
                              width: "100%", padding: "11px 0", borderRadius: 10,
                              background: liveShareWith.length > 0
                                ? "linear-gradient(135deg,#4b9fd4,#3a7fb0)" : "rgba(255,255,255,.05)",
                              color: liveShareWith.length > 0 ? "#fff" : "#5a5040",
                              border: "none", fontSize: 13, fontWeight: 800, fontFamily: "inherit",
                              cursor: liveShareWith.length > 0 ? "pointer" : "not-allowed",
                            }}>
                      {driverGeoPermission === "denied"
                        ? `${t("geo_retry")} — ${t("geo_grant_btn_driver")}`
                        : driverGeoPermission === "granted"
                          ? t("geo_share_start")
                          : t("geo_grant_btn_driver")}
                    </button>
                  </>
                )}
              </div>
            );
          })()}

          {/* Pending — grouped by city */}
          {pending.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: "#7a6a4a", fontWeight: 700, marginBottom: 12 }}>
                {t("driver_list_title")}
              </div>

              {groupedPending.map((group, gIdx) => (
                <div key={group.city} style={{ marginBottom: 22 }}>
                  {/* City header */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
                    padding: "8px 12px", borderRadius: 10,
                    background: "rgba(201,168,76,.08)", border: "1px solid rgba(201,168,76,.2)",
                  }}>
                    <span style={{ fontSize: 16 }}>🏘</span>
                    <div style={{ flex: 1, fontWeight: 800, color: "#c9a84c", fontSize: 14 }}>
                      {group.city}
                    </div>
                    <span style={{ fontSize: 11, color: "#7a6a4a" }}>
                      {group.list.length.toLocaleString("en")}
                    </span>
                  </div>

                  {group.list.map((g) => {
                    const ordinal = orderedSequence.indexOf(g) + 1;
                    const isNext = ordinal === 1;
                    return (
                    <div key={g.id} style={{
                      background: isNext ? "rgba(75,159,212,.07)" : "rgba(255,255,255,.03)",
                      border: `1.5px solid ${isNext ? "rgba(75,159,212,.28)" : "rgba(255,255,255,.08)"}`,
                      borderRadius: 16, padding: "14px 16px", marginBottom: 10,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div style={{ flex: 1, display: "flex", gap: 10, alignItems: "flex-start" }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                            background: isNext ? "rgba(75,159,212,.2)" : "rgba(255,255,255,.05)",
                            color: isNext ? "#4b9fd4" : "#7a6a4a",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontWeight: 900, fontSize: 13,
                          }}>{ordinal}</div>
                          <div>
                            <div style={{ fontWeight: 800, color: "#f5e6b8", fontSize: 15 }}>{g.name}</div>
                            {g.area && <div style={{ fontSize: 12, color: "#7a6a4a", marginTop: 4 }}>📍 {g.area}</div>}
                          </div>
                        </div>
                        {isNext && (
                          <span style={{
                            fontSize: 10, padding: "3px 10px", borderRadius: 20,
                            background: "rgba(75,159,212,.15)", color: "#4b9fd4", fontWeight: 700,
                          }}>{t("driver_next")}</span>
                        )}
                      </div>

                      {/* Phone + Waze (or no-address fallback) */}
                      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                        <a href={telLink(g.phone)} style={{
                          flex: 1, padding: "10px 0", borderRadius: 10, textAlign: "center",
                          background: "rgba(76,201,122,.12)", border: "1px solid rgba(76,201,122,.35)",
                          color: "#4cc97a", fontSize: 13, fontWeight: 700, display: "flex",
                          alignItems: "center", justifyContent: "center", gap: 6,
                        }}>
                          📞 <span style={{ direction: "ltr" }}>{g.phone}</span>
                        </a>
                        {g.area ? (
                          <a href={wazeLink(g.area)} target="_blank" rel="noreferrer" style={{
                            flex: 1, padding: "10px 0", borderRadius: 10, textAlign: "center",
                            background: "rgba(0,160,220,.12)", border: "1px solid rgba(0,160,220,.35)",
                            color: "#00b4dc", fontSize: 13, fontWeight: 700, display: "flex",
                            alignItems: "center", justifyContent: "center", gap: 6,
                          }}>{t("driver_open_waze")}</a>
                        ) : (
                          <div style={{
                            flex: 1, padding: "10px 0", borderRadius: 10, textAlign: "center",
                            background: "rgba(255,255,255,.03)", border: "1px dashed rgba(255,255,255,.1)",
                            color: "#5a5040", fontSize: 12, display: "flex",
                            alignItems: "center", justifyContent: "center",
                          }}>{t("driver_no_address")}</div>
                        )}
                      </div>

                      <button onClick={() => { setActiveId(activeId === g.id ? null : g.id); setPhotoTaken(false); setDeliveryNote(""); }}
                              style={{
                                width: "100%", padding: "10px 0", borderRadius: 10, cursor: "pointer",
                                background: activeId === g.id ? "rgba(201,168,76,.15)" : "rgba(201,168,76,.08)",
                                border: "1px solid rgba(201,168,76,.35)",
                                color: "#c9a84c", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                              }}>
                        {activeId === g.id ? t("driver_cancel") : t("driver_deliver_btn")}
                      </button>

                      {/* Delivery confirm panel */}
                      {activeId === g.id && (
                        <div style={{
                          marginTop: 14, padding: 14,
                          background: "rgba(76,201,122,.04)", border: "1px solid rgba(76,201,122,.18)",
                          borderRadius: 12, animation: "slideUp .3s ease",
                        }}>
                          <div style={{ fontSize: 12, color: "#4cc97a", fontWeight: 700, marginBottom: 12 }}>
                            {t("driver_complete_form")}
                          </div>

                          <div style={{ marginBottom: 6, fontSize: 12, color: "#7a6a4a" }}>
                            {t("driver_photo_label")} <span style={{ color: "#5a5040", fontWeight: 400 }}>{t("driver_photo_optional")}</span>
                          </div>
                          <label style={{
                            display: "block",
                            border: `2px dashed ${photoTaken ? "rgba(76,201,122,.5)" : "rgba(76,201,122,.25)"}`,
                            borderRadius: 10, padding: "16px 0", textAlign: "center",
                            marginBottom: 12, cursor: "pointer",
                            background: photoTaken ? "rgba(76,201,122,.08)" : "rgba(76,201,122,.02)",
                            transition: "all .2s",
                          }}>
                            <input type="file" accept="image/*" capture="environment"
                                   style={{ display: "none" }}
                                   onChange={e => {
                                     const file = e.target.files?.[0];
                                     if (!file) { setPhotoTaken(false); setPhotoData(null); return; }
                                     const reader = new FileReader();
                                     reader.onloadend = () => {
                                       setPhotoTaken(true);
                                       setPhotoData(typeof reader.result === "string" ? reader.result : null);
                                     };
                                     reader.readAsDataURL(file);
                                   }}/>
                            {photoTaken && photoData ? (
                              <>
                                <img src={photoData} alt="proof"
                                     style={{ maxWidth: 110, maxHeight: 110, borderRadius: 8, objectFit: "cover", marginBottom: 6 }}/>
                                <div style={{ fontSize: 12, color: "#4cc97a", fontWeight: 700 }}>{t("driver_photo_done")}</div>
                                <div style={{ fontSize: 10, color: "#5a7a5a", marginTop: 4 }}>{t("driver_photo_retake")}</div>
                              </>
                            ) : (
                              <>
                                <div style={{ fontSize: 32, marginBottom: 4 }}>📷</div>
                                <div style={{ fontSize: 12, color: "#5a7a5a" }}>{t("driver_photo_hint")}</div>
                              </>
                            )}
                          </label>

                          <div style={{ marginBottom: 6, fontSize: 12, color: "#7a6a4a" }}>{t("driver_note_label")}</div>
                          <input className="input-field" type="text"
                                 placeholder={t("driver_note_placeholder")}
                                 value={deliveryNote} onChange={e => setDeliveryNote(e.target.value)}
                                 style={{ marginBottom: 12, fontSize: 13 }}/>

                          <button onClick={() => markDelivered(g.id)} style={{
                            width: "100%", padding: 12, borderRadius: 10, border: "none",
                            background: "linear-gradient(135deg,#4cc97a,#2da85a)",
                            color: "#000", fontWeight: 900, fontSize: 14, fontFamily: "inherit",
                            cursor: "pointer", transition: "all .2s",
                          }}>{t("driver_confirm")}</button>
                        </div>
                      )}
                    </div>
                  );})}
                </div>
              ))}
            </>
          )}

          {/* Done list */}
          {done.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: "#7a6a4a", fontWeight: 700, margin: "20px 0 12px" }}>
                {t("driver_done_section")} ({done.length.toLocaleString("en")})
              </div>
              {done.map(g => (
                <div key={g.id} style={{
                  background: "rgba(76,201,122,.04)", border: "1px solid rgba(76,201,122,.14)",
                  borderRadius: 14, padding: "12px 16px", marginBottom: 8,
                  display: "flex", gap: 12, alignItems: "center",
                }}>
                  <div style={{ fontSize: 22 }}>✓</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, color: "rgba(245,230,184,.7)", fontSize: 14 }}>{g.name}</div>
                    <div style={{ fontSize: 11, color: "#4a7a4a" }}>
                      {g.area ? `📍 ${g.area} · ` : ""}{g.deliveredAt || ""}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#4cc97a", fontWeight: 700 }}>{t("driver_delivered_badge")}</div>
                </div>
              ))}
            </>
          )}

          {pending.length === 0 && myGuests.length > 0 && (
            <div style={{ textAlign: "center", padding: "44px 0" }}>
              <div style={{ fontSize: 60, marginBottom: 12 }}>🎉</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#4cc97a" }}>{t("driver_all_done_title")}</div>
              <div style={{ fontSize: 13, color: "#7a6a4a", marginTop: 8 }}>{t("driver_all_done_subtitle")}</div>
            </div>
          )}
        </>)}

        {/* ─── TAB: SHARED CITIES across multiple grooms ─── */}
        {tab === "shared" && (() => {
          const groomUsers = users.filter(u => u.role === "groom");
          const toggleGroom = (uname) => setSharedSelectedGrooms(prev =>
            prev.includes(uname) ? prev.filter(x => x !== uname) : [...prev, uname]
          );
          // Aggregate pending guests from selected grooms
          const pool = guests.filter(g =>
            g.status !== "delivered" && sharedSelectedGrooms.includes(g.groomUsername)
          );
          // Cities → list of guests
          const cityMap = new Map();
          for (const g of pool) {
            const c = extractCity(g.area);
            if (!cityMap.has(c)) cityMap.set(c, []);
            cityMap.get(c).push(g);
          }
          const sharedCities = [];
          for (const [c, list] of cityMap.entries()) {
            // Only include city if it has guests from 2+ grooms (truly shared) OR if 1 groom but user wants it
            const groomsInCity = new Set(list.map(g => g.groomUsername));
            sharedCities.push({ city: c, list, groomCount: groomsInCity.size });
          }
          // Prioritize truly-shared cities (2+ grooms) first
          sharedCities.sort((a, b) => b.groomCount - a.groomCount || b.list.length - a.list.length);

          return (
            <div style={{ animation: "fadeUp .3s ease" }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#c9a84c", fontFamily: "'Amiri',serif", marginBottom: 4 }}>
                  🏘 {t("shared_title")}
                </div>
                <div style={{ fontSize: 12, color: "#7a6a4a", lineHeight: 1.7 }}>
                  {t("shared_subtitle")}
                </div>
              </div>

              {sharedStep === "pickGrooms" && (
                <>
                  <div style={{ fontSize: 13, color: "#a09070", fontWeight: 700, marginBottom: 10 }}>
                    {t("shared_pick_grooms_label")}
                  </div>
                  {groomUsers.length === 0 ? (
                    <div className="card" style={{ textAlign: "center", padding: 32, color: "#7a6a4a" }}>
                      {t("shared_grooms_empty")}
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 18 }}>
                        {groomUsers.map(u => {
                          const isSel = sharedSelectedGrooms.includes(u.username);
                          return (
                            <button key={u.id} onClick={() => toggleGroom(u.username)} style={{
                              padding: "12px 10px", borderRadius: 12, cursor: "pointer",
                              background: isSel ? "rgba(201,168,76,.18)" : "rgba(255,255,255,.03)",
                              border: `1.5px solid ${isSel ? "#c9a84c" : "rgba(255,255,255,.08)"}`,
                              color: isSel ? "#c9a84c" : "#a09070",
                              fontWeight: 800, fontSize: 13, fontFamily: "inherit", textAlign: "center",
                              display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                              transition: "all .2s",
                            }}>
                              <span style={{ fontSize: 22 }}>{isSel ? "✓" : "♥"}</span>
                              <span style={{ direction: "ltr" }}>{u.username}</span>
                            </button>
                          );
                        })}
                      </div>
                      <button
                        disabled={sharedSelectedGrooms.length === 0}
                        onClick={() => setSharedStep("pickCity")}
                        style={{
                          width: "100%", padding: 12, borderRadius: 12,
                          background: sharedSelectedGrooms.length > 0 ? "linear-gradient(135deg,#c9a84c,#f0c84c)" : "rgba(255,255,255,.05)",
                          color: sharedSelectedGrooms.length > 0 ? "#000" : "#5a5040",
                          border: "none", fontWeight: 900, fontSize: 14, fontFamily: "inherit",
                          cursor: sharedSelectedGrooms.length > 0 ? "pointer" : "not-allowed",
                        }}>
                        {t("shared_view_btn")}
                      </button>
                    </>
                  )}
                </>
              )}

              {sharedStep === "pickCity" && (
                <>
                  <button onClick={() => setSharedStep("pickGrooms")} style={{
                    background: "none", border: "none", color: "#c9a84c", cursor: "pointer",
                    fontSize: 12, fontWeight: 700, marginBottom: 14, fontFamily: "inherit",
                  }}>{t("shared_back_to_grooms")}</button>

                  <div style={{ fontSize: 13, color: "#a09070", fontWeight: 700, marginBottom: 12 }}>
                    {t("shared_pick_city")}
                  </div>

                  {sharedCities.length === 0 ? (
                    <div className="card" style={{ textAlign: "center", padding: 32, color: "#7a6a4a" }}>
                      {t("shared_no_pending")}
                    </div>
                  ) : (
                    sharedCities.map(({ city, list, groomCount }) => (
                      <div key={city} onClick={() => { setSharedSelectedCity(city); setSharedStep("viewRoute"); }}
                        style={{
                          cursor: "pointer", marginBottom: 10, padding: "14px 16px",
                          borderRadius: 14,
                          background: groomCount > 1 ? "rgba(75,159,212,.07)" : "rgba(255,255,255,.03)",
                          border: `1px solid ${groomCount > 1 ? "rgba(75,159,212,.3)" : "rgba(255,255,255,.08)"}`,
                          display: "flex", alignItems: "center", gap: 12,
                        }}>
                        <span style={{ fontSize: 22 }}>🏘</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, color: "#f5e6b8", fontSize: 14 }}>{city}</div>
                          <div style={{ fontSize: 11, color: "#7a6a4a", marginTop: 2 }}>
                            {list.length.toLocaleString("en")} {t("shared_city_count")} · {groomCount.toLocaleString("en")} {groomCount === 1 ? (lang === "he" ? "חתן" : "عريس") : (lang === "he" ? "חתנים" : "عرسان")}
                          </div>
                        </div>
                        <span style={{ color: "#c9a84c", fontSize: 18 }}>←</span>
                      </div>
                    ))
                  )}
                </>
              )}

              {sharedStep === "viewRoute" && sharedSelectedCity && (() => {
                // Get pending guests in the selected city across selected grooms, ordered
                const cityGuests = guests
                  .filter(g => g.status !== "delivered"
                    && sharedSelectedGrooms.includes(g.groomUsername)
                    && extractCity(g.area) === sharedSelectedCity)
                  .sort((a, b) => (a.area || "").localeCompare(b.area || ""));
                return (
                  <>
                    <button onClick={() => { setSharedStep("pickCity"); setSharedSelectedCity(null); }} style={{
                      background: "none", border: "none", color: "#c9a84c", cursor: "pointer",
                      fontSize: 12, fontWeight: 700, marginBottom: 14, fontFamily: "inherit",
                    }}>{t("shared_back_to_cities")}</button>

                    <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 12,
                      background: "rgba(201,168,76,.08)", border: "1px solid rgba(201,168,76,.22)" }}>
                      <div style={{ fontSize: 12, color: "#7a6a4a" }}>{t("shared_route_in")}</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: "#c9a84c", fontFamily: "'Amiri',serif" }}>
                        🏘 {sharedSelectedCity}
                      </div>
                    </div>

                    {cityGuests.map((g, idx) => (
                      <div key={g.id} style={{
                        background: idx === 0 ? "rgba(75,159,212,.07)" : "rgba(255,255,255,.03)",
                        border: `1.5px solid ${idx === 0 ? "rgba(75,159,212,.28)" : "rgba(255,255,255,.08)"}`,
                        borderRadius: 16, padding: "14px 16px", marginBottom: 10,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                          <div style={{ flex: 1, display: "flex", gap: 10, alignItems: "flex-start" }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                              background: idx === 0 ? "rgba(75,159,212,.2)" : "rgba(255,255,255,.05)",
                              color: idx === 0 ? "#4b9fd4" : "#7a6a4a",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontWeight: 900, fontSize: 13,
                            }}>{idx + 1}</div>
                            <div>
                              <div style={{ fontWeight: 800, color: "#f5e6b8", fontSize: 15 }}>{g.name}</div>
                              <div style={{ fontSize: 10, color: "#c9a84c", marginTop: 3 }}>
                                {t("for_groom")} <span style={{ direction: "ltr" }}>{g.groomUsername}</span>
                              </div>
                              {g.area && <div style={{ fontSize: 12, color: "#7a6a4a", marginTop: 3 }}>📍 {g.area}</div>}
                            </div>
                          </div>
                          {idx === 0 && (
                            <span style={{
                              fontSize: 10, padding: "3px 10px", borderRadius: 20,
                              background: "rgba(75,159,212,.15)", color: "#4b9fd4", fontWeight: 700,
                            }}>{t("driver_next")}</span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <a href={telLink(g.phone)} style={{
                            flex: 1, padding: "9px 0", borderRadius: 10, textAlign: "center",
                            background: "rgba(76,201,122,.12)", border: "1px solid rgba(76,201,122,.35)",
                            color: "#4cc97a", fontSize: 13, fontWeight: 700, display: "flex",
                            alignItems: "center", justifyContent: "center", gap: 6,
                          }}>📞 <span style={{ direction: "ltr" }}>{g.phone}</span></a>
                          {g.area && (
                            <a href={wazeLink(g.area)} target="_blank" rel="noreferrer" style={{
                              flex: 1, padding: "9px 0", borderRadius: 10, textAlign: "center",
                              background: "rgba(0,160,220,.12)", border: "1px solid rgba(0,160,220,.35)",
                              color: "#00b4dc", fontSize: 13, fontWeight: 700, display: "flex",
                              alignItems: "center", justifyContent: "center", gap: 6,
                            }}>{t("driver_open_waze")}</a>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
          );
        })()}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#07070a" }}>
      {toast && (
        <div style={{
          position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
          background: "#1a1200", border: "1px solid #c9a84c88", borderRadius: 14,
          padding: "12px 24px", color: "#f5e6b8", fontWeight: 700, zIndex: 999,
          animation: "fadeUp .3s ease", whiteSpace: "nowrap",
        }}>{toast}</div>
      )}

      <div style={{
        position: "sticky", top: 0, zIndex: 50, background: "rgba(7,7,10,.95)",
        backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(201,168,76,.1)", padding: "0 16px",
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto", height: 54, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={onBack} style={{ background: "none", border: "none", color: "#7a6a4a", cursor: "pointer", fontSize: 16 }}>←</button>
            <span style={{ fontFamily: "'Amiri',serif", color: "#c9a84c", fontWeight: 900, fontSize: 18 }}>{lang === "he" ? "דעוה" : "دعوة"}</span>
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            {[
              ["dashboard", t("tab_dashboard")],
              ["guests",    t("tab_guests")],
              ["add",       t("tab_add")],
              ["proofs",    t("tab_proofs")],
              ["live",      t("tab_live")],
            ].map(([id,lbl]) => (
              <button key={id} className={`nav-tab${tab===id?" active":""}`} onClick={() => setTab(id)}
                      style={{ fontSize: 12, padding: "6px 10px" }}>{lbl}</button>
            ))}
            <LangSwitcher lang={lang} setLang={setLang} />
            <button onClick={() => setLogoutAsking(true)} title={t("logout")} style={{
              background: "rgba(212,80,58,.08)", border: "1px solid rgba(212,80,58,.3)",
              color: "#d47a4b", padding: "5px 10px", borderRadius: 8,
              fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginInlineStart: 4,
            }}>↩ {t("logout")}</button>
          </div>
        </div>
      </div>

      {logoutAsking && <LogoutConfirm t={t} onConfirm={doLogout} onCancel={() => setLogoutAsking(false)}/>}

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px 80px" }}>
        {/* ── DASHBOARD ── */}
        {tab === "dashboard" && (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 21, fontWeight: 900, color: "#f5e6b8", marginBottom: 4 }}>{t("dash_welcome")}</div>
              <div style={{ fontSize: 13, color: "#7a6a4a" }}>{t("dash_subtitle")}</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 20 }}>
              {[
                { label:t("stat_total"),     val:stats.total,     color:"#f5e6b8", icon:"📋" },
                { label:t("stat_delivered"), val:stats.delivered, color:"#4cc97a", icon:"✓" },
                { label:t("stat_enroute"),   val:stats.enroute,   color:"#4b9fd4", icon:"🚗" },
                { label:t("stat_pending"),   val:stats.pending,   color:"#c9a84c", icon:"⌛" },
              ].map(s => (
                <div key={s.label} className="card" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 26 }}>{s.icon}</div>
                  <div>
                    <div style={{ fontSize: 26, fontWeight: 900, color: s.color }}>{s.val.toLocaleString("en")}</div>
                    <div style={{ fontSize: 11, color: "#7a6a4a" }}>{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="gold-card" style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 14, color: "#a09070", fontWeight: 700 }}>{t("progress_label")}</span>
                <span style={{ fontSize: 20, fontWeight: 900, color: "#c9a84c" }}>{stats.pct}%</span>
              </div>
              <div style={{ height: 10, background: "rgba(255,255,255,.06)", borderRadius: 5, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${stats.pct}%`,
                  background: "linear-gradient(90deg,#c9a84c,#f0c84c)",
                  borderRadius: 5, transition: "width .6s ease",
                }}/>
              </div>
            </div>

            {/* ── Live map on the dashboard: groom's own location + every driver sharing ── */}
            <div style={{ marginBottom: 22 }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: 10, gap: 8, flexWrap: "wrap",
              }}>
                <div style={{ fontSize: 12, color: "#7a6a4a", fontWeight: 700 }}>
                  {t("map_legend")}
                  {driversSharingWithMe.length > 0 && (
                    <span style={{ color: "#4cc97a", marginInlineStart: 8 }}>
                      · {driversSharingWithMe.length.toLocaleString("en")} {t("map_drivers_count")}
                    </span>
                  )}
                </div>
                <button onClick={() => setTab("live")} style={{
                  background: "rgba(201,168,76,.12)", border: "1px solid rgba(201,168,76,.3)",
                  color: "#c9a84c", padding: "5px 12px", borderRadius: 8,
                  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                }}>{lang === "he" ? "מסך מלא ←" : "تكبير ←"}</button>
              </div>

              {/* Permission prompt for the groom if they haven't allowed location yet */}
              {groomGeoPermission !== "granted" && (
                <div style={{
                  padding: "12px 14px", borderRadius: 12, marginBottom: 10,
                  background: groomGeoPermission === "denied" ? "rgba(212,122,75,.08)" : "rgba(75,159,212,.06)",
                  border: `1px solid ${groomGeoPermission === "denied" ? "rgba(212,122,75,.28)" : "rgba(75,159,212,.22)"}`,
                  display: "flex", flexDirection: "column", gap: 8,
                }}>
                  {groomGeoPermission === "denied" && groomGeoError && (
                    <div style={{ fontSize: 12, color: "#d47a4b", lineHeight: 1.6 }}>⚠ {groomGeoError}</div>
                  )}
                  <button onClick={requestGroomLocation} style={{
                    padding: "10px 0", borderRadius: 10, cursor: "pointer",
                    background: "linear-gradient(135deg,#c9a84c,#f0c84c)",
                    color: "#000", border: "none", fontWeight: 900,
                    fontSize: 13, fontFamily: "inherit",
                  }}>
                    {groomGeoPermission === "denied"
                      ? `${t("geo_retry")} — ${t("geo_grant_btn_groom")}`
                      : t("geo_grant_btn_groom")}
                  </button>
                </div>
              )}

              {/* The actual map. Shown whether or not anyone is sharing — when nobody's
                  sharing the groom still sees themselves on a map. */}
              <div style={{
                borderRadius: 14, overflow: "hidden",
                border: "1px solid rgba(201,168,76,.18)",
              }}>
                {(groomCoords || driversSharingWithMe.length > 0) ? (
                  <LiveMap markers={groomMapMarkers} t={t} lang={lang} height={360}/>
                ) : (
                  <div style={{
                    height: 220, display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(255,255,255,.02)", color: "#7a6a4a",
                    fontSize: 13, textAlign: "center", padding: 24,
                  }}>
                    {t("map_no_location_yet")}
                  </div>
                )}
              </div>
            </div>

            <div style={{ fontSize: 13, color: "#7a6a4a", fontWeight: 700, marginBottom: 12 }}>{t("last_deliveries")}</div>
            {myGuests.filter(g => g.status === "delivered").map(g => {
              const isImg = typeof g.proofImg === "string" && g.proofImg.startsWith("data:image");
              return (
                <div key={g.id} className="card" style={{ marginBottom: 10, display: "flex", gap: 12, alignItems: "center" }}>
                  <div
                    onClick={() => isImg && setViewingPhoto(g.proofImg)}
                    style={{
                      width: 48, height: 48, borderRadius: 10, flexShrink: 0, overflow: "hidden",
                      background: "rgba(255,255,255,.04)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: isImg ? "zoom-in" : "default",
                    }}>
                    {isImg
                      ? <img src={g.proofImg} alt="proof" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                      : <span style={{ fontSize: 24 }}>{g.proofImg || "📸"}</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, color: "#f5e6b8", fontSize: 14 }}>{g.name}</div>
                    {g.area && <div style={{ fontSize: 12, color: "#7a6a4a" }}>{g.area}</div>}
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ color: "#4cc97a", fontSize: 12, fontWeight: 700 }}>{t("arrived")}</div>
                    <div style={{ color: "#5a5040", fontSize: 11 }}>{g.deliveredAt}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── GUESTS (with edit) ── */}
        {tab === "guests" && (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#f5e6b8" }}>
                {t("guests_count")} ({myGuests.length.toLocaleString("en")})
              </div>
              <button className="gold-btn" style={{ padding: "8px 16px", fontSize: 12 }} onClick={() => setTab("add")}>
                {t("guests_add_btn")}
              </button>
            </div>
            {myGuests.length === 0 && (
              <div className="card" style={{ textAlign: "center", padding: 32, color: "#7a6a4a" }}>
                {t("guests_empty")}
              </div>
            )}
            <div style={{ fontSize: 11, color: "#5a5040", marginBottom: 10, fontStyle: "italic" }}>
              {lang === "he" ? "💡 החלק את הכרטיס ימינה או לחץ על «←» כדי להסיר מוזמן" : "💡 اسحب البطاقة لليمين أو اضغط «←» لإزالة المعزوم"}
            </div>

            {(() => {
              // Split myGuests into "without address" and "with address" groups
              const withoutAddr = myGuests.filter(g => !g.area || !g.area.trim());
              const withAddr    = myGuests.filter(g =>  g.area &&  g.area.trim());

              // Shared card renderer (DRY — same card used in both sections)
              const renderCard = (g) => {
                const st = STATUS[g.status];
                const isRevealed = revealedId === g.id;
                const canDelete = g.status === "pending";
                return (
                  <div key={g.id} style={{ position: "relative", overflow: "hidden", borderRadius: 14, marginBottom: 10 }}>
                    {canDelete && (
                      <div style={{
                        position: "absolute", insetBlock: 0, insetInlineEnd: 0,
                        width: 110,
                        background: "linear-gradient(90deg,#b03020,#d4533a)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        borderRadius: 14, zIndex: 0,
                      }}>
                        <button onClick={() => { removeGuest(g.id); setRevealedId(null); }} style={{
                          background: "transparent", border: "none", color: "#fff",
                          fontWeight: 900, fontSize: 13, fontFamily: "inherit", cursor: "pointer",
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                        }}>
                          <span style={{ fontSize: 22 }}>🗑</span>
                          <span>{t("guests_delete")}</span>
                        </button>
                      </div>
                    )}
                    <div
                      onTouchStart={canDelete ? (e) => { swipeStartRef.current = { id: g.id, x: e.touches[0].clientX }; } : undefined}
                      onTouchEnd={canDelete ? (e) => {
                        if (swipeStartRef.current.id !== g.id) return;
                        const dx = e.changedTouches[0].clientX - swipeStartRef.current.x;
                        if (dx > 50)        setRevealedId(g.id);
                        else if (dx < -50)  setRevealedId(null);
                        swipeStartRef.current = { id: null, x: 0 };
                      } : undefined}
                      style={{
                        background: g.status==="delivered" ? "rgba(76,201,122,.04)" : "#0f0f15",
                        border: `1px solid ${g.status==="delivered" ? "rgba(76,201,122,.2)" : "rgba(255,255,255,.07)"}`,
                        borderRadius: 14, padding: "14px 16px",
                        display: "flex", alignItems: "center", gap: 12,
                        transform: isRevealed ? "translateX(110px)" : "translateX(0)",
                        transition: "transform .28s cubic-bezier(.22,1,.36,1)",
                        position: "relative", zIndex: 1, touchAction: "pan-y",
                      }}
                    >
                      <div style={{ fontSize: 20 }}>{st.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, color: "#f5e6b8", fontSize: 14, marginBottom: 2 }}>{g.name}</div>
                        <div style={{ fontSize: 11, color: "#5a5040", direction: "ltr", textAlign: "right" }}>{g.phone}</div>
                        {g.area && <div style={{ fontSize: 12, color: "#7a6a4a" }}>📍 {g.area}</div>}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <span className="status-badge" style={{ background: st.bg, color: st.color }}>{t("stat_" + g.status)}</span>
                        <span style={{
                          fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 700,
                          background: g.inviteType==="vip" ? "rgba(155,75,212,.15)" : "rgba(201,168,76,.12)",
                          color: g.inviteType==="vip" ? "#c084fc" : "#c9a84c",
                        }}>{g.inviteType==="vip" ? t("type_vip") : t("type_premium")}</span>
                        {canDelete && (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <button onClick={() => startEdit(g)}
                                    style={{ background: "rgba(201,168,76,.12)", border: "1px solid rgba(201,168,76,.3)",
                                             color: "#c9a84c", fontSize: 11, fontWeight: 700,
                                             cursor: "pointer", padding: "3px 8px", borderRadius: 8, fontFamily: "inherit" }}>
                              {t("guests_edit")}
                            </button>
                            <button onClick={() => setRevealedId(isRevealed ? null : g.id)}
                                    title={t("guests_delete")}
                                    style={{
                                      background: isRevealed ? "rgba(212,80,58,.25)" : "rgba(212,80,58,.08)",
                                      border: "1px solid rgba(212,80,58,.4)",
                                      color: "#d47a4b", fontSize: 13, fontWeight: 900,
                                      cursor: "pointer", padding: "3px 9px",
                                      borderRadius: 8, fontFamily: "inherit",
                                      transition: "all .2s",
                                    }}>
                              {isRevealed ? "✕" : "←"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              };

              const sectionHeader = (title, count, color, bg) => (
                <div style={{
                  display: "flex", alignItems: "center", gap: 10, marginTop: 16, marginBottom: 10,
                  padding: "10px 14px", borderRadius: 10,
                  background: bg, border: `1px solid ${color}33`,
                }}>
                  <div style={{ flex: 1, fontWeight: 800, color, fontSize: 14 }}>{title}</div>
                  <span style={{ fontSize: 11, color, fontWeight: 700 }}>{count.toLocaleString("en")}</span>
                </div>
              );

              return (
                <>
                  {withoutAddr.length > 0 && (
                    <>
                      {sectionHeader(t("guests_without_address"), withoutAddr.length, "#d47a4b", "rgba(212,122,75,.06)")}
                      <div style={{ fontSize: 11, color: "#7a6a4a", marginBottom: 10, lineHeight: 1.7, padding: "0 6px" }}>
                        {t("guests_without_hint")}
                      </div>
                      {withoutAddr.map(renderCard)}
                    </>
                  )}
                  {withAddr.length > 0 && (
                    <>
                      {sectionHeader(t("guests_with_address"), withAddr.length, "#4cc97a", "rgba(76,201,122,.06)")}
                      {withAddr.map(renderCard)}
                    </>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* ── ADD GUEST ── */}
        {tab === "add" && (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 19, fontWeight: 900, color: "#c9a84c", fontFamily: "'Amiri',serif", marginBottom: 4 }}>
                {t("add_title")}
              </div>
              <div style={{ fontSize: 12, color: "#7a6a4a" }}>
                {t("add_subtitle")}
              </div>
            </div>

            <div className="gold-card" style={{ padding: 24 }}>
              <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("field_name")}</div>
              <input className="input-field" type="text" placeholder={t("example_name")}
                     value={gName} onChange={e => setGName(e.target.value)}
                     style={{ marginBottom: 14 }}/>

              <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("field_phone")}</div>
              <input className="input-field" type="tel" inputMode="numeric" maxLength={15}
                     placeholder={t("example_phone")}
                     value={gPhone}
                     onChange={e => setGPhone(e.target.value.replace(/[^\d]/g, ""))}
                     style={{ marginBottom: 14, direction: "ltr", textAlign: "right" }}/>

              <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>
                {t("field_address")} <span style={{ color: "#5a5040", fontWeight: 400 }}>{t("field_address_optional")}</span>
              </div>
              <div style={{ marginBottom: 14 }}>
                <AddressInput value={gArea} onChange={setGArea}
                              placeholder={t("example_address")} lang={lang} t={t}/>
              </div>

              <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("field_invite_type")}</div>
              <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                {[
                  { val: "premium", lbl: t("type_premium"), color: "#c9a84c" },
                  { val: "vip",     lbl: t("type_vip"),     color: "#c084fc" },
                ].map(opt => (
                  <button key={opt.val} onClick={() => setGType(opt.val)} style={{
                    flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer",
                    background: gType===opt.val ? `${opt.color}22` : "rgba(255,255,255,.04)",
                    border: `1.5px solid ${gType===opt.val ? opt.color : "rgba(255,255,255,.08)"}`,
                    color: gType===opt.val ? opt.color : "#7a6a4a",
                    fontWeight: 800, fontSize: 13, fontFamily: "inherit", transition: "all .2s",
                  }}>{opt.lbl}</button>
                ))}
              </div>

              <button className="gold-btn" style={{ width: "100%" }} onClick={addGuest}
                      disabled={!gName.trim() || !gPhone.trim()}>
                {t("add_submit")}
              </button>
            </div>

            <div style={{
              marginTop: 16, padding: 14, borderRadius: 12,
              background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)",
              fontSize: 12, color: "#7a6a4a", lineHeight: 1.8,
            }}>
              {t("add_tip")}
            </div>
          </div>
        )}

        {/* ── PROOFS ── */}
        {tab === "proofs" && (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ marginBottom: 14, fontSize: 15, fontWeight: 800, color: "#f5e6b8" }}>{t("proofs_title")}</div>
            {myGuests.filter(g => g.proofImg).map(g => {
              const isImageData = typeof g.proofImg === "string" && g.proofImg.startsWith("data:image");
              return (
                <div key={g.id} className="card" style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div
                      onClick={() => isImageData && setViewingPhoto(g.proofImg)}
                      style={{
                        width: 76, height: 76, borderRadius: 12, flexShrink: 0,
                        background: "linear-gradient(135deg,#1a1200,#2d1f00)",
                        border: "1px solid rgba(201,168,76,.2)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        overflow: "hidden", cursor: isImageData ? "zoom-in" : "default",
                        position: "relative",
                      }}
                      title={isImageData ? t("photo_view") : ""}
                    >
                      {isImageData ? (
                        <img src={g.proofImg} alt="proof"
                             style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                      ) : (
                        <div style={{ fontSize: 30 }}>{g.proofImg}</div>
                      )}
                      {isImageData && (
                        <div style={{
                          position: "absolute", bottom: 2, right: 2,
                          background: "rgba(0,0,0,.7)", color: "#fff",
                          padding: "2px 5px", borderRadius: 4, fontSize: 10,
                        }}>🔍</div>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, color: "#f5e6b8", fontSize: 14 }}>{g.name}</div>
                      {g.area && <div style={{ fontSize: 12, color: "#7a6a4a", marginTop: 3 }}>📍 {g.area}</div>}
                      <div style={{ fontSize: 11, color: "#5a5040", marginTop: 3 }}>{t("proofs_distributor")} {g.deliveredBy} · {g.deliveredAt}</div>
                      {isImageData && (
                        <button onClick={() => setViewingPhoto(g.proofImg)} style={{
                          marginTop: 6, background: "rgba(201,168,76,.12)",
                          border: "1px solid rgba(201,168,76,.3)", color: "#c9a84c",
                          padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                          cursor: "pointer", fontFamily: "inherit",
                        }}>🔍 {t("photo_view")}</button>
                      )}
                    </div>
                    <span className="status-badge" style={{ background:"rgba(76,201,122,.15)", color:"#4cc97a" }}>✓</span>
                  </div>
                </div>
              );
            })}
            {myGuests.filter(g => !g.proofImg).length > 0 && (
              <div style={{ marginTop: 20, textAlign: "center", color: "#5a5040", fontSize: 12 }}>
                {myGuests.filter(g => !g.proofImg).length.toLocaleString("en")} {t("proofs_pending")}
              </div>
            )}
          </div>
        )}

        {/* ── LIVE MAP — combined view (groom + all drivers) ── */}
        {tab === "live" && (
          <div style={{ animation: "fadeUp .3s ease" }}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 19, fontWeight: 900, color: "#c9a84c", fontFamily: "'Amiri',serif", marginBottom: 4 }}>
                {t("live_title")}
              </div>
              <div style={{ fontSize: 12, color: "#7a6a4a" }}>
                {t("live_subtitle")}
              </div>
            </div>

            {/* Groom location permission */}
            {groomGeoPermission !== "granted" && (
              <div style={{
                padding: "12px 14px", borderRadius: 12, marginBottom: 12,
                background: groomGeoPermission === "denied" ? "rgba(212,122,75,.08)" : "rgba(75,159,212,.06)",
                border: `1px solid ${groomGeoPermission === "denied" ? "rgba(212,122,75,.28)" : "rgba(75,159,212,.22)"}`,
                display: "flex", flexDirection: "column", gap: 8,
              }}>
                {groomGeoPermission === "denied" && groomGeoError && (
                  <div style={{ fontSize: 12, color: "#d47a4b", lineHeight: 1.6 }}>⚠ {groomGeoError}</div>
                )}
                <button onClick={requestGroomLocation} style={{
                  padding: "12px 0", borderRadius: 10, cursor: "pointer",
                  background: "linear-gradient(135deg,#c9a84c,#f0c84c)",
                  color: "#000", border: "none", fontWeight: 900,
                  fontSize: 14, fontFamily: "inherit",
                }}>
                  {groomGeoPermission === "denied"
                    ? `${t("geo_retry")} — ${t("geo_grant_btn_groom")}`
                    : t("geo_grant_btn_groom")}
                </button>
              </div>
            )}

            {/* Active drivers banner */}
            {driversSharingWithMe.length > 0 && (
              <div style={{
                marginBottom: 12, padding: "10px 14px", borderRadius: 10,
                background: "rgba(76,201,122,.06)", border: "1px solid rgba(76,201,122,.22)",
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap",
              }}>
                <div style={{ fontSize: 12, color: "#4cc97a", fontWeight: 700 }}>
                  🚗 {driversSharingWithMe.length.toLocaleString("en")} {t("map_drivers_count")}{" "}
                  · <span style={{ direction: "ltr", color: "#c9a84c" }}>
                    {driversSharingWithMe.map(d => d.driver).join(", ")}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: "#4cc97a", fontWeight: 700 }}>
                  {t("geo_updating")}
                </div>
              </div>
            )}

            {/* The map. Always shown — even if no driver is sharing, the groom sees themselves. */}
            <div style={{
              borderRadius: 14, overflow: "hidden",
              border: "1px solid rgba(201,168,76,.18)",
              background: "#fff",
            }}>
              {(groomCoords || driversSharingWithMe.length > 0) ? (
                <LiveMap markers={groomMapMarkers} t={t} lang={lang} height={520}/>
              ) : (
                <div style={{
                  height: 380, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  background: "rgba(255,255,255,.02)", color: "#7a6a4a",
                  fontSize: 14, textAlign: "center", padding: 24, gap: 14,
                }}>
                  <div style={{ fontSize: 48 }}>📡</div>
                  <div style={{ fontWeight: 800, color: "#c9a84c" }}>
                    {driversSharingWithMe.length === 0 ? t("no_driver_sharing") : t("map_no_location_yet")}
                  </div>
                  <div style={{ fontSize: 12, color: "#7a6a4a", maxWidth: 420, lineHeight: 1.8 }}>
                    {t("live_empty_body")}
                  </div>
                </div>
              )}
            </div>

            {/* Per-driver detail rows under the map (last fix time + accuracy) */}
            {driversSharingWithMe.length > 0 && (
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                {driversSharingWithMe.map(d => (
                  <div key={d.driver} className="card" style={{
                    padding: "10px 14px", display: "flex", alignItems: "center", gap: 12,
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: "linear-gradient(135deg,#4b9fd4,#3a7fb0)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, flexShrink: 0,
                    }}>🚗</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, color: "#f5e6b8", fontSize: 13, direction: "ltr", textAlign: "right" }}>
                        {d.driver}
                      </div>
                      <div style={{ fontSize: 10, color: "#7a6a4a", direction: "ltr", textAlign: "right" }}>
                        {d.lat.toFixed(5)}, {d.lng.toFixed(5)} · ±{d.accuracy || 0}{t("geo_meters")}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: "#4cc97a", fontWeight: 700, whiteSpace: "nowrap" }}>
                      {d.time ? d.time.toLocaleTimeString(lang === "he" ? "he-IL" : "ar", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── PHOTO VIEWER MODAL ── full-screen image preview when groom taps a proof */}
      {viewingPhoto && (
        <div onClick={() => setViewingPhoto(null)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.92)",
          zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center",
          padding: 16, animation: "fadeIn .25s ease", cursor: "zoom-out",
        }}>
          <button onClick={() => setViewingPhoto(null)} style={{
            position: "absolute", top: 16, insetInlineEnd: 16,
            background: "rgba(0,0,0,.6)", border: "1px solid rgba(255,255,255,.2)",
            color: "#fff", padding: "8px 14px", borderRadius: 10,
            fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
          }}>✕ {t("photo_close")}</button>
          <img src={viewingPhoto} alt="proof full"
               onClick={e => e.stopPropagation()}
               style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8, boxShadow: "0 8px 40px rgba(0,0,0,.7)" }}/>
        </div>
      )}

      {/* ── EDIT GUEST MODAL ── */}
      {editingGuest && (
        <div onClick={cancelEdit} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.78)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, padding: 20, animation: "fadeIn .25s ease",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            maxWidth: 440, width: "100%",
            background: "#0c0c11", border: "1px solid rgba(201,168,76,.3)",
            borderRadius: 18, padding: 24, animation: "slideUp .3s ease",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div style={{ color: "#c9a84c", fontWeight: 900, fontSize: 18, fontFamily: "'Amiri',serif" }}>
                {t("edit_title")}
              </div>
              <button onClick={cancelEdit} style={{
                background: "none", border: "none", color: "#7a6a4a", fontSize: 22,
                cursor: "pointer", padding: 0, lineHeight: 1,
              }}>×</button>
            </div>

            <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("field_name")}</div>
            <input className="input-field" type="text" placeholder={t("example_name")}
                   value={eName} onChange={e => setEName(e.target.value)}
                   style={{ marginBottom: 12 }}/>

            <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("field_phone")}</div>
            <input className="input-field" type="tel" inputMode="numeric" maxLength={15}
                   placeholder={t("example_phone")}
                   value={ePhone}
                   onChange={e => setEPhone(e.target.value.replace(/[^\d]/g, ""))}
                   style={{ marginBottom: 12, direction: "ltr", textAlign: "right" }}/>

            <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>
              {t("field_address")} <span style={{ color: "#5a5040", fontWeight: 400 }}>{t("field_address_optional")}</span>
            </div>
            <div style={{ marginBottom: 12 }}>
              <AddressInput value={eArea} onChange={setEArea}
                            placeholder={t("example_address")} lang={lang} t={t}/>
            </div>

            <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("field_invite_type")}</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              {[
                { val: "premium", lbl: t("type_premium"), color: "#c9a84c" },
                { val: "vip",     lbl: t("type_vip"),     color: "#c084fc" },
              ].map(opt => (
                <button key={opt.val} onClick={() => setEType(opt.val)} style={{
                  flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer",
                  background: eType===opt.val ? `${opt.color}22` : "rgba(255,255,255,.04)",
                  border: `1.5px solid ${eType===opt.val ? opt.color : "rgba(255,255,255,.08)"}`,
                  color: eType===opt.val ? opt.color : "#7a6a4a",
                  fontWeight: 800, fontSize: 13, fontFamily: "inherit",
                }}>{opt.lbl}</button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button className="ghost-btn" style={{ flex: 1 }} onClick={cancelEdit}>
                {t("edit_cancel")}
              </button>
              <button className="gold-btn" style={{ flex: 1 }} onClick={saveEdit}
                      disabled={!eName.trim() || !ePhone.trim()}>
                {t("edit_save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════ */
/* LANGUAGE SWITCHER */
/* ══════════════════════════════════════ */
function LangSwitcher({ lang, setLang }) {
  return (
    <div style={{
      display: "inline-flex", borderRadius: 10, overflow: "hidden",
      border: "1px solid rgba(201,168,76,.3)", background: "rgba(255,255,255,.03)",
    }}>
      {[
        { code: "ar", lbl: "AR" },
        { code: "he", lbl: "HE" },
      ].map(({ code, lbl }) => (
        <button key={code} onClick={() => setLang(code)} style={{
          padding: "5px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer",
          background: lang === code ? "rgba(201,168,76,.18)" : "transparent",
          color: lang === code ? "#c9a84c" : "#7a6a4a",
          border: "none", fontFamily: "inherit", transition: "all .2s",
        }}>{lbl}</button>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════ */
/* ROOT */
/* ══════════════════════════════════════ */
/* ══════════════════════════════════════ */
/* GUEST CONFIRMATION FORM                                            */
/* Opens via URL like ?form=GROOM_USERNAME — guest fills their info   */
/* and the submission is stored in localStorage (dawa_confirmations). */
/* ══════════════════════════════════════ */
function ConfirmationForm({ groomUsername, t, lang, setLang }) {
  const [name, setName]     = useState("");
  const [phone, setPhone]   = useState("");
  const [city, setCity]     = useState("");
  const [street, setStreet] = useState("");
  const [house, setHouse]   = useState("");
  const [done, setDone]     = useState(false);
  const [error, setError]   = useState("");

  const submit = () => {
    if (!name.trim() || !phone.trim() || !city.trim()) {
      setError(t("conf_form_invalid"));
      return;
    }
    setError("");
    try {
      const existing = JSON.parse(localStorage.getItem("dawa_confirmations") || "[]");
      const entry = {
        id: Date.now(),
        groomUsername: groomUsername || "",
        submittedName:   name.trim(),
        submittedPhone:  phone.trim().replace(/\s+/g, ""),
        submittedCity:   city.trim(),
        submittedStreet: street.trim(),
        submittedHouse:  house.trim(),
        confirmedAt:     new Date().toISOString(),
      };
      const updated = [...existing, entry];
      localStorage.setItem("dawa_confirmations", JSON.stringify(updated));
    } catch {}
    setDone(true);
  };

  if (done) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
          <h1 style={{ fontFamily: "'Amiri',serif", color: "#4cc97a", fontSize: 28, marginBottom: 12 }}>
            {t("conf_form_thanks_title")}
          </h1>
          <p style={{ color: "rgba(245,230,184,.8)", fontSize: 14, lineHeight: 1.9 }}>
            {t("conf_form_thanks_body")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", padding: "24px 16px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <LangSwitcher lang={lang} setLang={setLang}/>
        </div>

        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            <BrandLogo size={68} />
          </div>
          <h1 style={{ fontFamily: "'Amiri',serif", color: "#c9a84c", fontSize: 26, marginBottom: 10 }}>
            {t("conf_form_welcome_title")}
          </h1>
          <p style={{ color: "rgba(245,230,184,.78)", fontSize: 13, lineHeight: 1.9, maxWidth: 400, margin: "0 auto" }}>
            {t("conf_form_welcome_body")}
          </p>
        </div>

        <div className="gold-card">
          <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("conf_form_full_name")} *</div>
          <input className="input-field" type="text" placeholder={t("example_name")}
                 value={name} onChange={e => setName(e.target.value)}
                 style={{ marginBottom: 14 }}/>

          <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("conf_form_phone")} *</div>
          <input className="input-field" type="tel" inputMode="numeric" maxLength={15}
                 placeholder={t("example_phone")}
                 value={phone}
                 onChange={e => setPhone(e.target.value.replace(/[^\d]/g, ""))}
                 style={{ marginBottom: 14, direction: "ltr", textAlign: "right" }}/>

          <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("conf_form_city")} *</div>
          <div style={{ marginBottom: 14 }}>
            <CityField value={city} onChange={setCity} lang={lang} t={t}/>
          </div>

          <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("conf_form_street")}</div>
          <input className="input-field" type="text"
                 value={street} onChange={e => setStreet(e.target.value)}
                 style={{ marginBottom: 14 }}/>

          <div style={{ marginBottom: 6, fontSize: 12, color: "#a09070" }}>{t("conf_form_house_number")}</div>
          <input className="input-field" type="text" placeholder="86"
                 value={house} onChange={e => setHouse(e.target.value)}
                 style={{ marginBottom: 14, direction: "ltr", textAlign: "right" }}/>

          {error && (
            <div style={{ color: "#d47a4b", fontSize: 12, marginBottom: 12, textAlign: "center" }}>{error}</div>
          )}

          <button className="gold-btn" style={{ width: "100%" }} onClick={submit}
                  disabled={!name.trim() || !phone.trim() || !city.trim()}>
            {t("conf_form_submit")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Root() {
  // Detect URL parameter ?form=GROOM_USERNAME to show the guest confirmation form
  const initialFormGroom = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("form") || "";
    } catch { return ""; }
  }, []);

  const [view, setView] = useState(() => {
    if (initialFormGroom) return "confirmForm";
    try {
      const authed = localStorage.getItem("dawa_session_authed");
      return authed === "true" ? "groom" : "landing";
    } catch { return "landing"; }
  });
  // Persist language choice between sessions
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem("dawa_lang") || "ar"; }
    catch { return "ar"; }
  });
  const t = useMemo(() => makeT(lang), [lang]);

  useEffect(() => { try { localStorage.setItem("dawa_lang", lang); } catch {} }, [lang]);
  useEffect(() => { try { localStorage.setItem("dawa_view", view); } catch {} }, [view]);

  // Apply RTL for both AR + HE (Hebrew is also RTL); ensure body direction stays rtl
  useEffect(() => {
    document.documentElement.dir = "rtl";
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <>
      <GlobalStyle />
      {view === "confirmForm" && <ConfirmationForm groomUsername={initialFormGroom} t={t} lang={lang} setLang={setLang}/>}
      {view === "landing" && <LandingPage onEnterPortal={() => setView("groom")} t={t} lang={lang} setLang={setLang} />}
      {view === "groom"   && <GroomPortal  onBack={() => setView("landing")} t={t} lang={lang} setLang={setLang} />}
    </>
  );
}
