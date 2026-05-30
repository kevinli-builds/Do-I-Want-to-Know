import { Router } from 'express'
import ExcelJS from 'exceljs'
import { prisma } from '../lib/prisma'
import { computeStats } from '../lib/stats'
import { CATEGORY_LABELS } from '../lib/categories'

const router = Router()

// Purple theme matching the app's brand colour
const PURPLE  = 'FF6C63FF'
const WHITE   = 'FFFFFFFF'
const LIGHT   = 'FFF3F2FF'
const MUTED   = 'FF888899'

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
router.get('/:userId', async (req, res) => {
  const { userId } = req.params

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return void res.status(404).json({ error: 'User not found' })

  const entries = await prisma.ledgerEntry.findMany({
    where: { userId },
    orderBy: { date: 'desc' },
  })

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
      vendor:      e.vendor,
      description: e.description,
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

  // ── Sheet 2: Marketing Email ──────────────────────────────────────────────
  const mktSheet = wb.addWorksheet('Marketing Email', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  mktSheet.columns = [
    { header: 'Date',        key: 'date',        width: 14 },
    { header: 'Sender',      key: 'vendor',      width: 28 },
    { header: 'Subject',     key: 'description', width: 52 },
  ]

  mktSheet.getRow(1).eachCell(cell => Object.assign(cell, headerStyle('FF5249E0')))
  mktSheet.getRow(1).height = 22

  const mktEntries = entries.filter(e => e.category === 'marketing')
  mktEntries.forEach((e, i) => {
    const row = mktSheet.addRow({
      date:        e.date,
      vendor:      e.vendor,
      description: e.description,
    })
    const alt = altRow(i % 2 === 1)
    row.eachCell(cell => {
      if (alt.fill) cell.fill = alt.fill
    })
    row.getCell('date').numFmt = 'yyyy-mm-dd'
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
    const row = sumSheet.addRow([label, value])
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

  if (entries.length > 0) {
    const stats = computeStats(entries)

    addSection('📊 Overview')
    addKV('Total Purchase Spend',      stats.totalSpend, false)
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
})

export { router as exportRouter }
