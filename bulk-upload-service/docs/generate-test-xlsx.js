/**
 * Generate test XLSX file for order.delay bulk upload scenario.
 *
 * Usage: node docs/generate-test-xlsx.js
 * Output: docs/test-order-delay.xlsx
 *
 * Requires: exceljs (already installed as a service dependency)
 */

const ExcelJS = require('exceljs');
const path = require('path');

async function generate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('order.delay');

  // Header row (17 columns)
  const headers = [
    'eventType',
    'cycleId',
    'customerId',
    'customerEmail',
    'customerName',
    'orderId',
    'phone',
    'message',
    'images',
    'trackingNumber',
    'carrierId',
    'trackingURL',
    'promiseDate',
    'item.sku',
    'item.name',
    'item.quantity',
    'item.price',
  ];

  sheet.addRow(headers);

  // Bold header row
  sheet.getRow(1).font = { bold: true };

  // Row 1 — Order 611214544-A, item 1
  sheet.addRow([
    'order.delay',
    '123132',
    'omar-ola@hotmail7.com',
    'omar-ola@hotmail.com',
    'Omar Ola',
    '611214544-A',
    '40009954',
    'Lamentamos (sorry) informarle que su pedido ha sufrido un retraso. Se estara entregando el dia de mañana',
    '[{"url":"https://backoffice.max.com.gt/media/catalog/product/cache/94dd7777337ccc7ac42c8ee85d48fab6/r/u/rush.jpg"}]',
    'FD15454',
    'FORZA_GT',
    'https://www.forzadelivery.com/gt/',
    '2026-02-25T06:10:00Z',
    'RUSH',
    'Ventilador de piso y pared Taurus de 20 pulgadas',
    1,
    79.99,
  ]);

  // Row 2 — Order 611214544-A, item 2 (same order, different item)
  sheet.addRow([
    'order.delay',
    '123132',
    'omar-ola@hotmail7.com',
    'omar-ola@hotmail.com',
    'Omar Ola',
    '611214544-A',
    '40009954',
    'Lamentamos (sorry) informarle que su pedido ha sufrido un retraso. Se estara entregando el dia de mañana',
    '[{"url":"https://backoffice.max.com.gt/media/catalog/product/cache/94dd7777337ccc7ac42c8ee85d48fab6/r/u/rush.jpg"}]',
    'FD15454',
    'FORZA_GT',
    'https://www.forzadelivery.com/gt/',
    '2026-02-25T06:10:00Z',
    'FAN-20',
    'Ventilador de techo industrial 52 pulgadas',
    2,
    129.99,
  ]);

  // Row 3 — Order 611214544-B (different order, single item)
  sheet.addRow([
    'order.delay',
    '123132',
    'maria.garcia@example.com',
    'maria.garcia@example.com',
    'Maria Garcia',
    '611214544-B',
    '50012345',
    'Lamentamos informarle que su pedido ha sufrido un retraso. Se estara entregando el dia de mañana',
    '[{"url":"https://backoffice.max.com.gt/media/catalog/product/cache/94dd7777337ccc7ac42c8ee85d48fab6/t/v/tv55.jpg"}]',
    'FD15499',
    'FORZA_GT',
    'https://www.forzadelivery.com/gt/',
    '2026-02-26T08:00:00Z',
    'TV-55',
    'Smart TV LED 55 pulgadas 4K',
    1,
    499.99,
  ]);

  // Auto-fit column widths
  sheet.columns.forEach((column) => {
    let maxLength = 10;
    column.eachCell({ includeEmpty: false }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLength) maxLength = Math.min(len, 50);
    });
    column.width = maxLength + 2;
  });

  const outputPath = path.join(__dirname, 'test-order-delay.xlsx');
  await workbook.xlsx.writeFile(outputPath);
  console.log(`Generated: ${outputPath}`);
}

generate().catch((err) => {
  console.error('Failed to generate XLSX:', err);
  process.exit(1);
});
