const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data.json');

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return {}; }
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

module.exports = {
  getDomains(chatId) { return load()[chatId] || []; },
  getAllChats() { return load(); },
  addDomain(chatId, domain) {
    const data = load();
    if (!data[chatId]) data[chatId] = [];
    if (!data[chatId].includes(domain)) data[chatId].push(domain);
    save(data);
  },
  removeDomain(chatId, domain) {
    const data = load();
    if (!data[chatId]) return false;
    const idx = data[chatId].indexOf(domain);
    if (idx === -1) return false;
    data[chatId].splice(idx, 1);
    save(data);
    return true;
  },
};
