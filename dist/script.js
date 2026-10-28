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
  bookingForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.querySelector('#booking-status');
    const data = new FormData(bookingForm);
    const method = data.get('contactMethod') === 'email' ? 'Електронна пошта' : 'Телефон';
    const subject = `Запит на запис — ${data.get('service')}`;
    const body = [
      'Новий запит на запис до HealtlyTeeth',
      '',
      `Послуга: ${data.get('service')}`,
      `Бажана дата: ${data.get('date')}`,
      `Бажаний час: ${data.get('time')}`,
      `ПІБ: ${data.get('name')}`,
      `Телефон: ${data.get('phone')}`,
      `Email: ${data.get('email')}`,
      `Бажаний спосіб зв’язку: ${method}`, 
      '',
      'Будь ласка, зв’яжіться з клієнтом, щоб підтвердити час.'
    ].join('\n');
    const submitButton = bookingForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    status.textContent = 'Надсилаємо заявку…';
    status.classList.remove('is-error');

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(data.entries()))
      });
      if (response.status === 404) {
        // Static preview fallback. On the Node.js server, requests use the API above.
        status.textContent = 'Відкриваємо email-запит. Перевірте його та надішліть у поштовій програмі.';
        window.location.href = `mailto:${clinicEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        return;
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Не вдалося надіслати заявку. Спробуйте пізніше.');
      status.textContent = 'Заявку отримано. На вашу пошту надіслано лист-підтвердження отримання. Клініка окремо зв’яжеться з вами, щоб підтвердити час.';
      bookingForm.reset();
      if (visitDate) visitDate.min = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    } catch (error) {
      status.textContent = error.message || 'Не вдалося надіслати заявку. Перевірте з’єднання та спробуйте ще раз.';
      status.classList.add('is-error');
    } finally {
      submitButton.disabled = false;
    }
  });
}
