import { Router } from 'express'
import ExcelJS from 'exceljs'
import { prisma } from '../lib/prisma'
import { computeStats } from '../lib/stats'
import { getUsdRates } from '../lib/fx'
import { CATEGORY_LABELS } from '../lib/categories'
import { asyncHandler } from '../lib/asyncHandler'
import { requireSession, enforceOwnership } from '../lib/session'
import { findUserOr404 } from '../lib/ledger'

const router = Router()
router.use(requireSession)
router.param('userId', enforceOwnership) // 403 unless :userId matches the token's user

// Purple theme matching the app's brand colour
const PURPLE  = 'FF6C63FF'
const WHITE   = 'FFFFFFFF'
const LIGHT   = 'FFF3F2FF'

function headerStyle(color = PURPLE): Partial<ExcelJS.Style> {
  return {
    font: { bold: true, color: { argb: WHITE }, size: 11 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: color } },
    alignment: { vertical: 'middle', horizontal: 'center' },
    border: {
      bottom: { style: 'thin', color: { argb: PURPLE } },
    },
  }
}

// Guard against spreadsheet formula injection: a text cell that begins with
// = + - @ (or a leading tab/CR) can be executed as a formula by Excel/Sheets.
// Vendor + description text is user- and email-derived, so prefix any such value
// with an apostrophe to force it to literal text.
function safeText(v: string | null | undefined): string {
  const s = String(v ?? '')
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

function altRow(isAlt: boolean): Partial<ExcelJS.Style> {
  return {
    fill: isAlt
      ? { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }
      : { type: 'pattern', pattern: 'none' },
  }
}

// GET /export/:userId
// Streams an Excel workbook with three sheets:
//   1. Transactions  – every purchase / subscription / travel / food etc.
//   2. Marketing     – every promotional email with sender + date
//   3. Summary       – key stats (total spend, top vendors, charities, etc.)
router.get('/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params

  const user = await findUserOr404(res, userId)
  if (!user) return

  const entries = await prisma.ledgerEntry.findMany({
    where: { userId },
    orderBy: { date: 'desc' },
  })
  const rates = await getUsdRates()
  const stats = entries.length > 0 ? computeStats(entries, rates) : null

  const wb = new ExcelJS.Workbook()
  wb.creator  = 'Do I Want To Know'
  wb.created  = new Date()
  wb.modified = new Date()

  // ── Sheet 1: Transactions ─────────────────────────────────────────────────
  const txSheet = wb.addWorksheet('Transactions', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  txSheet.columns = [
    { header: 'Date',        key: 'date',        width: 14 },
    { header: 'Category',    key: 'category',    width: 18 },
    { header: 'Vendor',      key: 'vendor',      width: 22 },
    { header: 'Description', key: 'description', width: 46 },
    { header: 'Amount',      key: 'amount',      width: 12 },
    { header: 'Currency',    key: 'currency',    width: 10 },
  ]

  // Style header row
  txSheet.getRow(1).eachCell(cell => Object.assign(cell, headerStyle()))
  txSheet.getRow(1).height = 22

  const txEntries = entries.filter(e => e.category !== 'marketing')
  txEntries.forEach((e, i) => {
    const row = txSheet.addRow({
      date:        e.date,
      category:    CATEGORY_LABELS[e.category as keyof typeof CATEGORY_LABELS] ?? e.category,
      vendor:      safeText(e.vendor),
      description: safeText(e.description),
      amount:      e.amount ?? '',
      currency:    e.currency,
    })
    const alt = altRow(i % 2 === 1)
    row.eachCell(cell => {
      if (alt.fill) cell.fill = alt.fill
    })
    // Format date cell
    const dateCell = row.getCell('date')
    dateCell.numFmt = 'yyyy-mm-dd'
    // Format amount cell
    if (e.amount != null) {
      const amtCell = row.getCell('amount')
      amtCell.numFmt = '#,##0.00'
    }
  })

  // Auto-filter on header row
  txSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to:   { row: 1, column: txSheet.columns.length },
  }

  // ── Sheet: Subscriptions ──────────────────────────────────────────────────
  const subSheet = wb.addWorksheet('Subscriptions', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  subSheet.columns = [
    { header: 'Subscription', key: 'vendor',   width: 26 },
    { header: 'Cadence',      key: 'cadence',  width: 12 },
    { header: 'Est. Monthly', key: 'monthly',  width: 14 },
    { header: 'Last Amount',  key: 'last',     width: 14 },
    { header: 'Last Charge',  key: 'lastDate', width: 14 },
    { header: 'Charges Seen', key: 'count',    width: 13 },
    { header: 'Status',       key: 'status',   width: 12 },
  ]
  subSheet.getRow(1).eachCell(cell => Object.assign(cell, headerStyle()))
  subSheet.getRow(1).height = 22

  const insights = stats?.subscriptionInsights ?? []
  insights.forEach((s, i) => {
    const row = subSheet.addRow({
      vendor:   safeText(s.vendor),
      cadence:  s.cadence,
      monthly:  s.monthlyEstimate || '',
      last:     s.lastAmount ?? '',
      lastDate: s.lastCharge,
      count:    s.chargeCount,
      status:   s.active ? 'Active' : 'Inactive',
    })
    const alt = altRow(i % 2 === 1)
    row.eachCell(cell => { if (alt.fill) cell.fill = alt.fill })
    if (s.monthlyEstimate) row.getCell('monthly').numFmt = '#,##0.00'
    if (s.lastAmount != null) row.getCell('last').numFmt = '#,##0.00'
  })
  if (stats && insights.length > 0) {
    const totalRow = subSheet.addRow({ vendor: 'TOTAL (active)', monthly: stats.monthlySubscriptionCost })
    totalRow.getCell('vendor').font  = { bold: true }
    totalRow.getCell('monthly').numFmt = '#,##0.00'
    totalRow.getCell('monthly').font = { bold: true, color: { argb: PURPLE } }
  }
  subSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to:   { row: 1, column: subSheet.columns.length },
  }

  // ── Sheet: Marketing Email ────────────────────────────────────────────────
  const mktSheet = wb.addWorksheet('Marketing Email', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  mktSheet.columns = [
    { header: 'Date',         key: 'date',        width: 14 },
    { header: 'Sender',       key: 'vendor',      width: 24 },
    { header: 'Sender Email', key: 'senderEmail', width: 30 },
    { header: 'Subject',      key: 'description', width: 44 },
    { header: 'Unsubscribe',  key: 'unsubscribe', width: 16 },
  ]

  mktSheet.getRow(1).eachCell(cell => Object.assign(cell, headerStyle('FF5249E0')))
  mktSheet.getRow(1).height = 22

  const mktEntries = entries.filter(e => e.category === 'marketing')
  mktEntries.forEach((e, i) => {
    const row = mktSheet.addRow({
      date:        e.date,
      vendor:      safeText(e.vendor),
      senderEmail: safeText(e.senderEmail),
      description: safeText(e.description),
      unsubscribe: e.unsubscribe ?? '',
    })
    const alt = altRow(i % 2 === 1)
    row.eachCell(cell => {
      if (alt.fill) cell.fill = alt.fill
    })
    row.getCell('date').numFmt = 'yyyy-mm-dd'
    // Render an https unsubscribe link as a clickable "Unsubscribe" hyperlink
    if (e.unsubscribe && /^https?:/i.test(e.unsubscribe)) {
      const cell = row.getCell('unsubscribe')
      cell.value = { text: 'Unsubscribe', hyperlink: e.unsubscribe }
      cell.font = { color: { argb: 'FF5249E0' }, underline: true }
    }
  })

  mktSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to:   { row: 1, column: mktSheet.columns.length },
  }

  // ── Sheet 3: Summary ─────────────────────────────────────────────────────
  const sumSheet = wb.addWorksheet('Summary')
  sumSheet.columns = [
    { key: 'label', width: 32 },
    { key: 'value', width: 24 },
  ]

  function addSection(title: string) {
    const row = sumSheet.addRow([title, ''])
    row.getCell(1).font  = { bold: true, color: { argb: WHITE }, size: 12 }
    row.getCell(1).fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: PURPLE } }
    row.getCell(2).fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: PURPLE } }
    row.height = 20
    sumSheet.mergeCells(row.number, 1, row.number, 2)
  }

  function addKV(label: string, value: string | number, isAlt = false) {
    // Label can be a user/email-derived vendor name — guard against formula injection.
    const row = sumSheet.addRow([safeText(label), typeof value === 'number' ? value : safeText(value)])
    if (isAlt) {
      row.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }
      })
    }
    row.getCell(1).font = { color: { argb: 'FF333344' } }
    if (typeof value === 'number') {
      row.getCell(2).numFmt = '#,##0.00'
      row.getCell(2).font   = { bold: true }
    } else {
      row.getCell(2).font   = { bold: true, color: { argb: PURPLE } }
    }
  }

  if (stats) {
    addSection('📊 Overview')
    addKV('Total Purchase Spend',      stats.totalSpend, false)
    addKV('Monthly Subscriptions',     stats.monthlySubscriptionCost, true)
    addKV('Annual Subscriptions',      stats.annualSubscriptionCost, false)
    addKV('Total Donations',           stats.charityTotal, true)
    addKV('Total Tracked Emails',      entries.length, false)
    addKV('Subscriptions',             stats.subscriptionCount, true)
    addKV('Promotional Emails',        (stats.topSpammers.reduce((s, x) => s + x.count, 0)), false)
    sumSheet.addRow([])

    addSection('🏆 Top Purchase Vendors')
    stats.topVendors.forEach((v, i) => addKV(v.vendor, `${v.count} orders`, i % 2 === 1))
    sumSheet.addRow([])

    addSection('📬 Top Marketing Senders')
    stats.topSpammers.forEach((s, i) => addKV(s.vendor, `${s.count} emails`, i % 2 === 1))
    sumSheet.addRow([])

    if (stats.charities.length > 0) {
      addSection('💝 Donations')
      stats.charities.forEach((c, i) => {
        const val = c.total > 0 ? c.total : `${c.count} emails`
        addKV(c.vendor, val, i % 2 === 1)
      })
      sumSheet.addRow([])
    }

    addSection('📂 Category Breakdown')
    Object.entries(stats.byCategory)
      .sort((a, b) => b[1].count - a[1].count)
      .forEach(([cat, info], i) => {
        const label = CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS] ?? cat
        addKV(
          `${label} (${info.count})`,
          info.spend > 0 ? info.spend : info.count,
          i % 2 === 1,
        )
      })
  } else {
    sumSheet.addRow(['No data yet — sync your emails first.', ''])
  }

  // ── Stream response ───────────────────────────────────────────────────────
  const safeName = (user.email ?? userId).replace(/[^a-z0-9@._-]/gi, '_')
  const filename  = `inbox-wrapped-${safeName}.xlsx`

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  await wb.xlsx.write(res)
  res.end()
}))

export { router as exportRouter }
