/* =====================================================================
   بيانات التواصل — ASK Legal Advisors & Law Firm
   ---------------------------------------------------------------------
   ده الملف الوحيد اللي بتعدّل فيه أي رقم أو إيميل أو عنوان.
   الموقع كله بياخد البيانات من هنا.

   القواعد:
   - غيّر الكلام اللي بين علامتي التنصيص "..." بس.
   - ماتمسحش العلامات: "  ,  :  {  }  [  ]
   - اكتب الأرقام بكود الدولة، والمسافات اختيارية.
   ===================================================================== */

window.ASK_CONTACT = {

  // الأرقام
  whatsapp:      "+20 100 663 5664",   // واتساب
  phoneEgypt:    "+20 100 396 9395",   // الاتصال من داخل مصر
  phoneAbroad:   "+44 7883 450801",    // الاتصال من خارج مصر

  // الإيميلات
  emailGeneral:  "hello@askuniversal.com",
  emailFounder:  "amr@askuniversal.com",

  // الموقع
  website:       "www.askuniversal.com",

  // المكاتب (بالترتيب اللي بيظهر في صفحة تواصل معنا)
  offices: [
    {
      cityAr: "القاهرة — المقر الرئيسي",
      cityEn: "Cairo — Headquarters",
      address: "Villa 111, Street 12, First District, Fifth Settlement, New Cairo 11477, Egypt",
      phone: "+20 100 396 9395"
    },
    {
      cityAr: "الإسكندرية",
      cityEn: "Alexandria",
      address: "123 El Tayaran Towers, El Mamoura El Shati, Alexandria, Egypt",
      phone: "+20 100 396 9395"
    },
    {
      cityAr: "المملكة المتحدة",
      cityEn: "United Kingdom",
      address: "18 Hanover Point, Norton, Stockton-on-Tees, TS20 1RA, United Kingdom",
      phone: "+44 7883 450801"
    }
  ]
};


/* ---------------------------------------------------------------------
   الجزء ده تقني — مش محتاج تلمسه.
   بيحط البيانات اللي فوق في كل الأماكن المعلّمة في صفحات الموقع.
   --------------------------------------------------------------------- */
(function(){
  var C = window.ASK_CONTACT;
  function digits(v){ return String(v || '').replace(/\D/g, ''); }
  function esc(v){
    return String(v || '').replace(/[&<>"']/g, function(ch){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch];
    });
  }
  function mapsUrl(address){
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address);
  }

  C.links = {
    whatsapp:     'https://wa.me/' + digits(C.whatsapp),
    phoneEgypt:   'tel:+' + digits(C.phoneEgypt),
    phoneAbroad:  'tel:+' + digits(C.phoneAbroad),
    emailGeneral: 'mailto:' + C.emailGeneral,
    emailFounder: 'mailto:' + C.emailFounder,
    website:      'https://' + String(C.website).replace(/^https?:\/\//, ''),
    mapsHq:       mapsUrl(C.offices[0] && C.offices[0].address)
  };

  function apply(){
    document.querySelectorAll('[data-ask-href]').forEach(function(el){
      var url = C.links[el.getAttribute('data-ask-href')];
      if(url){ el.setAttribute('href', url); }
    });
    document.querySelectorAll('[data-ask-text]').forEach(function(el){
      var value = C[el.getAttribute('data-ask-text')];
      if(typeof value === 'string'){ el.textContent = value; }
    });
    document.querySelectorAll('[data-ask-offices]').forEach(function(box){
      box.innerHTML = C.offices.map(function(o, i){
        return '<div class="off-card reveal visible" style="transition-delay:' + (i * 0.1) + 's">' +
          '<div class="off-city"><span class="ar">' + esc(o.cityAr) + '</span><span class="en">' + esc(o.cityEn) + '</span></div>' +
          '<a class="off-addr" dir="ltr" href="' + mapsUrl(o.address) + '" target="_blank" rel="noopener noreferrer">' + esc(o.address) + '</a>' +
          '<a class="off-phone" dir="ltr" href="tel:+' + digits(o.phone) + '">' + esc(o.phone) + '</a>' +
        '</div>';
      }).join('');
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
