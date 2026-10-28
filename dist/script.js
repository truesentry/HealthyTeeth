const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    toggle.setAttribute('aria-label', expanded ? 'Відкрити меню' : 'Закрити меню');
    nav.classList.toggle('is-open', !expanded);
  });
  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Відкрити меню');
    nav.classList.remove('is-open');
  }));
}
document.querySelector('#year').textContent = new Date().getFullYear();

// The preferred date is requested, not guaranteed; the clinic confirms the visit.
const visitDate = document.querySelector('#visit-date');
if (visitDate) {
  const today = new Date();
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  visitDate.min = localToday;
}
const bookingForm = document.querySelector('#booking-form');
const clinicEmail = 'HealthlyTeeth@gmail.com';
if (bookingForm) {
  bookingForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const status = document.querySelector('#booking-status');
    if (!clinicEmail) {
      status.textContent = 'Не вдалося відкрити email-запит. Спробуйте ще раз або напишіть до клініки напряму.';
      status.classList.add('is-error');
      return;
    }
    const data = new FormData(bookingForm);
    const method = data.get('contactMethod') === 'email' ? 'Email' : 'Телефон';
    const subject = `Запит на запис — ${data.get('service')}`;
    const body = [
      'Новий запит на запис до HealtlyTeeth',
      '',
      `Послуга: ${data.get('service')}`,
      `Бажана дата: ${data.get('date')}`,
      `Зручний час: ${data.get('period')}`,
      `Ім’я: ${data.get('name')}`,
      `${method}: ${data.get('contactValue')}`,
      '',
      'Будь ласка, зв’яжіться з клієнтом, щоб підтвердити час.'
    ].join('\n');
    status.textContent = 'Відкриваємо лист із заявкою. Перевірте його та натисніть «Надіслати» у поштовій програмі.';
    status.classList.remove('is-error');
    window.location.href = `mailto:${clinicEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
}
const contactMethod = document.querySelector('#contact-method');
const contactValue = document.querySelector('#contact-value');
const contactValueLabel = document.querySelector('#contact-value-label');
if (contactMethod && contactValue && contactValueLabel) {
  const updateContactField = () => {
    const isEmail = contactMethod.value === 'email';
    contactValue.type = isEmail ? 'email' : 'tel';
    contactValue.autocomplete = isEmail ? 'email' : 'tel';
    contactValue.inputMode = isEmail ? 'email' : 'tel';
    contactValue.maxLength = isEmail ? 160 : 24;
    contactValue.placeholder = isEmail ? 'name@example.com' : '+380 __ ___ __ __';
    contactValueLabel.firstChild.textContent = isEmail ? 'Електронна пошта' : 'Номер телефону';
  };
  contactMethod.addEventListener('change', updateContactField);
}
