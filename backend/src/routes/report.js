const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');
const { SEVERITY_RULES } = require('../services/severity');
const theme = require('../theme');
const { generateDynamicReport } = require('../services/reportGenerator');
const { checkUrl } = require('../services/savedReports');
const { getJsonReportForUrl, convertJsonToReportView } = require('../services/jsonReports');

const router = express.Router();

const NAVY=theme.primary, RED=theme.secondary, GREEN='#059669', AMBER='#D97706', BLUE='#2563EB', GRAY='#64748B', LIGHT=theme.surface;
const RISK_COLOR={ HIGH:RED, MEDIUM:AMBER, LOW:BLUE, CLEAN:GREEN, PENDING:GRAY, ERROR:GRAY };
const RISK_BG   ={ HIGH:'#FEF2F2', MEDIUM:'#FFFBEB', LOW:'#EFF6FF', CLEAN:'#F0FDF4', PENDING:LIGHT, ERROR:LIGHT };
const SEV_COLOR ={ HIGH:RED, MEDIUM:AMBER, LOW:BLUE };
const SEV_BG    ={ HIGH:'#FFF5F5', MEDIUM:'#FFFBEB', LOW:'#EFF6FF' };
const PW=595.28, PH=841.89, M=45, CW=PW-M*2;

function th(doc,text,opts={}) { return doc.heightOfString(String(text||''),{width:opts.width||CW,...opts}); }
function sp(doc,need,y) { if(y+need>PH-55){doc.addPage();return M+8;} return y; }
function rule(doc,y,c='#E2E8F0') { doc.moveTo(M,y).lineTo(PW-M,y).strokeColor(c).lineWidth(0.4).stroke(); }
function hd(doc,text,y) { doc.fontSize(12).font('Helvetica-Bold').fillColor(NAVY).text(text,M,y); rule(doc,y+17); return y+26; }

function embedShot(doc,shotPath,y,opts={}) {
  const maxW=opts.width||CW, maxH=opts.maxH||280, x=opts.x||M;
  if (!shotPath||!fs.existsSync(shotPath)) {
    y=sp(doc,34,y);
    doc.rect(x,y,maxW,26).fill('#F9FAFB').stroke('#E5E7EB');
    doc.fontSize(7).font('Helvetica').fillColor(GRAY).text('Screenshot not captured',x,y+9,{width:maxW,align:'center'});
    return y+32;
  }
  try {
    const img=doc.openImage(shotPath);
    const scale=Math.min(maxW/img.width,maxH/img.height,1);
    const dw=Math.round(img.width*scale), dh=Math.round(img.height*scale);
    y=sp(doc,dh+12,y);
    doc.rect(x+2,y+2,dw,dh).fill('#E5E7EB');
    doc.image(shotPath,x,y,{width:dw,height:dh});
    doc.rect(x,y,dw,dh).stroke('#CBD5E1');
    return y+dh+8;
  } catch(e) {
    y=sp(doc,24,y);
    doc.rect(x,y,maxW,18).fill('#FFF5F5').stroke('#FCA5A5');
    doc.fontSize(7).font('Helvetica').fillColor(RED).text(`Screenshot error`,x+4,y+5,{width:maxW-8});
    return y+24;
  }
}

router.get('/:scanId/json', async (req, res) => {
  const scan = db.prepare(`SELECT * FROM scans WHERE id = ?`).get(req.params.scanId);
  if (!scan) return res.status(404).json({ error: 'Scan not found' });

  // Check if this URL has an imported JSON report
  const jsonReportData = getJsonReportForUrl(scan.target_url);
  if (jsonReportData) {
    const reportView = convertJsonToReportView(jsonReportData.report);
    return res.json(reportView);
  }

  // No imported JSON report for this URL
  return res.status(404).json({ error: 'No imported report available for this URL' });
});

router.get('/:scanId', async (req, res) => {
  const scan = db.prepare(`SELECT * FROM scans WHERE id = ?`).get(req.params.scanId);
  if (!scan) return res.status(404).json({ error: 'Scan not found' });

  // ── Check if this URL has an imported JSON report with PDF ──
  const jsonReportData = getJsonReportForUrl(scan.target_url);
  if (jsonReportData) {
    console.log(`[REPORT] Returning original PDF for imported report: ${scan.target_url}`);
    const pdfPath = jsonReportData.mapping.filePath;
    
    if (fs.existsSync(pdfPath)) {
      const fileName = path.basename(pdfPath);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', fs.statSync(pdfPath).size);
      fs.createReadStream(pdfPath).pipe(res);
      return;
    }
  }

  // ── Fallback: Check if this is a Saved Report (old domain-only matching) ──
  const savedReport = checkUrl(scan.target_url);
  if (savedReport.found) {
    console.log(`[REPORT] Returning saved report PDF for: ${scan.target_url}`);
    
    // Map URL to correct PDF file
    const reportMapping = [
      {
        domain: 'creditinsurancecalculator.allianceinsurance.in',
        filePath: path.join(__dirname, '..', '..', 'reports', 'Lucidflow_Dark Pattern_Alliance Insurance.pdf'),
      },
      {
        domain: 'insurance-deception-explorer.lovable.app',
        filePath: path.join(__dirname, '..', '..', 'reports', 'Lucidflow_Dark Pattern Report_ABC Insurance.pdf'),
      },
    ];
    
    let pdfPath = null;
    for (const mapping of reportMapping) {
      if (scan.target_url.includes(mapping.domain)) {
        pdfPath = mapping.filePath;
        break;
      }
    }
    
    if (pdfPath && fs.existsSync(pdfPath)) {
      const fileName = path.basename(pdfPath);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', fs.statSync(pdfPath).size);
      fs.createReadStream(pdfPath).pipe(res);
      return;
    }
  }

  const pages = db.prepare(`SELECT * FROM pages WHERE scan_id = ?`).all(req.params.scanId);
  const findingsStmt = db.prepare(`SELECT * FROM findings WHERE page_id = ?`);
  const recsStmt = db.prepare(`SELECT text FROM recommendations WHERE page_id = ? ORDER BY sort_order`);

  const results = pages.map(p => ({
    ...p,
    patterns_found: findingsStmt.all(p.id),
    recommendations: recsStmt.all(p.id).map(r => r.text),
  }));

  const byRisk = { HIGH:0, MEDIUM:0, LOW:0, CLEAN:0, ERROR:0, PENDING:0 };
  const patternFreq = {};
  const allFindings = [];
  results.forEach(r => {
    byRisk[r.overall_risk] = (byRisk[r.overall_risk]||0)+1;
    r.patterns_found.forEach(f => {
      patternFreq[f.pattern_name] = (patternFreq[f.pattern_name]||0)+1;
      allFindings.push({ ...f, page_url: r.url, page_title: r.title });
    });
  });
  const topPatterns = Object.entries(patternFreq).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}));
  const stats = { total: results.length, byRisk, topPatterns, allFindings };

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="irdai-scan-${req.params.scanId.slice(0,8)}.pdf"`);

  const doc = new PDFDocument({margin:M,size:'A4',bufferPages:true});
  doc.pipe(res);

  // ── COVER ──
  doc.rect(0,0,PW,134).fill(NAVY);
  doc.fillColor('white').fontSize(18).font('Helvetica-Bold').text('IRDAI Dark Pattern Scan Report',M,28,{width:CW});
  doc.fontSize(9).font('Helvetica').fillColor('#93C5FD').text('Fully Local AI Analysis · CCPA Guidelines Nov 2023 · IRDAI Directive Apr 2026',M,54,{width:CW});
  doc.fontSize(8).fillColor('#CBD5E1')
     .text(`Target    : ${scan.target_url}`,M,78)
     .text(`Generated : ${new Date().toLocaleString('en-IN',{dateStyle:'long',timeStyle:'short'})}`,M,91)
     .text(`Scanned   : ${stats.total} pages · ${stats.allFindings.length} findings`,M,104);

  let y=146;
  const cards=[{l:'Pages Scanned',v:stats.total,c:NAVY},{l:'High Risk',v:stats.byRisk.HIGH,c:RED},{l:'Medium Risk',v:stats.byRisk.MEDIUM,c:AMBER},{l:'Low Risk',v:stats.byRisk.LOW,c:BLUE},{l:'Clean',v:stats.byRisk.CLEAN,c:GREEN}];
  const cw2=CW/cards.length;
  cards.forEach((c,i)=>{
    const cx=M+i*cw2;
    doc.rect(cx,y,cw2-3,52).fill(LIGHT).stroke('#E2E8F0');
    doc.fontSize(20).font('Helvetica-Bold').fillColor(c.c).text(String(c.v),cx+2,y+7,{width:cw2-8,align:'center'});
    doc.fontSize(7).font('Helvetica').fillColor(GRAY).text(c.l,cx+2,y+34,{width:cw2-8,align:'center'});
  });
  y+=60;

  doc.rect(M,y,CW,22).fill(stats.byRisk.HIGH>0?'#FEF2F2':'#F0FDF4');
  doc.fontSize(9.5).font('Helvetica-Bold').fillColor(stats.byRisk.HIGH>0?RED:GREEN)
     .text(`${stats.allFindings.length} dark pattern findings across ${stats.total} pages`,M,y+6,{width:CW,align:'center'});
  y+=30;

  if (stats.topPatterns.length) {
    y=hd(doc,'Most Frequently Detected Patterns',y);
    const mx=stats.topPatterns[0].count||1;
    stats.topPatterns.slice(0,8).forEach(p=>{
      const bw=Math.max(4,(p.count/mx)*(CW-80));
      doc.rect(M,y,CW-80,13).fill('#F1F5F9'); doc.rect(M,y,bw,13).fill(RED);
      doc.fontSize(7.5).font('Helvetica').fillColor('white').text(p.name,M+3,y+3,{width:CW-84,lineBreak:false});
      doc.fillColor('#1E293B').text(`${p.count}`,M+CW-74,y+3);
      y+=17;
    });
    y+=6;
  }

  // ── PER-PAGE DETAIL ──
  for (const result of results) {
    if (result.overall_risk==='ERROR' || result.overall_risk==='PENDING') continue;
    doc.addPage(); y=M;
    const rColor=RISK_COLOR[result.overall_risk]||GRAY;
    const foundCount=result.patterns_found?.length||0;

    doc.rect(M,y,CW,2).fill(rColor); y+=3;
    doc.rect(M,y,CW,22).fill(RISK_BG[result.overall_risk]||LIGHT);
    doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#1E293B').text(result.title||result.url,M+5,y+6,{width:CW*0.7,lineBreak:false,ellipsis:true});
    doc.fontSize(8).font('Helvetica-Bold').fillColor(rColor).text(`${result.overall_risk} · ${foundCount} findings`,M+CW*0.72,y+7,{width:CW*0.26,align:'right'});
    y+=22;
    doc.fontSize(7).font('Helvetica').fillColor('#6B7280').text(result.url,M+5,y+2,{width:CW-10}); y=doc.y+4;
    if (result.summary) { doc.fontSize(8.5).font('Helvetica').fillColor('#374151').text(result.summary,M+5,y,{width:CW-10}); y=doc.y+6; }

    const ssW=Math.round(CW*0.43), findW=CW-ssW-10, findX=M+ssW+10;
    const colY=y;
    let ssEndY=embedShot(doc,result.screenshot_path,colY,{x:M,width:ssW,maxH:400});

    let findEndY=colY;
    if (foundCount>0) {
      result.patterns_found.forEach(f=>{
        const sc=SEV_COLOR[f.severity]||GRAY, sb=SEV_BG[f.severity]||LIGHT;
        const evH=f.evidence?th(doc,f.evidence,{width:findW-10,fontSize:7.5})+3:0;
        const blkH=18+evH+8;
        if (findEndY+blkH>PH-55) { doc.addPage(); findEndY=M; }
        doc.rect(findX,findEndY,findW,blkH).fill(sb).stroke(sc+'55');
        doc.rect(findX,findEndY,3,blkH).fill(sc);
        const tag = f.source==='manual' ? ' [MANUAL]' : '';
        doc.fontSize(7).font('Helvetica-Bold').fillColor(sc).text(`[${f.severity}] ${f.pattern_name}${tag}`,findX+6,findEndY+4,{width:findW-10});
        let fy=findEndY+14;
        if (f.evidence) { doc.fontSize(7.5).font('Helvetica').fillColor('#1F2937').text(f.evidence,findX+6,fy,{width:findW-10}); fy=doc.y+3; }
        findEndY=fy+4;
      });
    } else {
      doc.rect(findX,findEndY,findW,26).fill('#F0FDF4').stroke('#6EE7B7');
      doc.fontSize(8).font('Helvetica').fillColor(GREEN).text('No dark patterns detected',findX+6,findEndY+8,{width:findW-10});
      findEndY+=32;
    }

    y=Math.max(ssEndY,findEndY)+8;
    if (result.recommendations?.length) {
      y=sp(doc,22,y); rule(doc,y,'#E2E8F0'); y+=5;
      doc.rect(M,y,CW,14).fill('#F0FDF4');
      doc.fontSize(7.5).font('Helvetica-Bold').fillColor(GREEN).text('Recommended Fixes',M+5,y+3); y+=14;
      result.recommendations.forEach((r,i)=>{
        const rh=th(doc,`${i+1}. ${r}`,{width:CW-12,fontSize:7.5});
        y=sp(doc,rh+5,y);
        doc.fontSize(7.5).font('Helvetica').fillColor('#065F46').text(`${i+1}. ${r}`,M+5,y,{width:CW-12}); y=doc.y+4;
      });
    }
  }

  // ── High severity summary ──
  const high=stats.allFindings.filter(f=>f.severity==='HIGH');
  if (high.length) {
    doc.addPage();
    doc.rect(0,0,PW,44).fill('#FEF2F2');
    doc.fontSize(13).font('Helvetica-Bold').fillColor(RED).text(`High Severity — Immediate Action (${high.length})`,M,13,{width:CW});
    rule(doc,44,'#FCA5A5'); y=54;
    high.forEach(f=>{
      const evH=f.evidence?th(doc,f.evidence,{width:CW-14,fontSize:8})+4:0;
      const bh=32+evH; y=sp(doc,bh+6,y);
      doc.rect(M,y,CW,bh).fill('#FFF5F5').stroke('#FCA5A5'); doc.rect(M,y,3,bh).fill(RED);
      doc.fontSize(8.5).font('Helvetica-Bold').fillColor(RED).text(f.pattern_name,M+8,y+6);
      doc.fontSize(7.5).font('Helvetica').fillColor(GRAY).text(f.page_url,M+8,y+18,{width:CW-16});
      if(f.evidence) doc.fontSize(8).fillColor('#1F2937').text(f.evidence,M+8,y+28,{width:CW-16});
      y+=bh+8;
    });
  }

  // ── Corrective Action Plan ──
  doc.addPage();
  doc.rect(0,0,PW,44).fill(NAVY);
  doc.fontSize(13).font('Helvetica-Bold').fillColor('white').text('Corrective Action Plan Template',M,13,{width:CW});
  doc.fontSize(7.5).fillColor('#93C5FD').text('IRDAI April 2, 2026 directive — submit within 30 days',M,31); y=56;
  const byPat={};
  stats.allFindings.forEach(f=>{if(!byPat[f.pattern_name])byPat[f.pattern_name]=[];byPat[f.pattern_name].push(f);});
  const cols=[{l:'Pattern',x:M+3,w:160},{l:'Pages',x:M+168,w:50},{l:'Severity',x:M+223,w:70},{l:'Owner',x:M+298,w:110},{l:'Status',x:M+413,w:120}];
  doc.rect(M,y,CW,16).fill(NAVY);
  cols.forEach(c=>doc.fontSize(7.5).font('Helvetica-Bold').fillColor('white').text(c.l,c.x,y+4,{width:c.w})); y+=16;
  Object.entries(byPat).forEach(([name,findings],idx)=>{
    const mx=findings.some(f=>f.severity==='HIGH')?'HIGH':findings.some(f=>f.severity==='MEDIUM')?'MEDIUM':'LOW';
    y=sp(doc,15,y);
    doc.rect(M,y,CW,14).fill(idx%2===0?'#F9FAFB':'white').stroke('#F1F5F9');
    doc.fontSize(7.5).font('Helvetica').fillColor('#1F2937')
       .text(name,cols[0].x,y+3,{width:cols[0].w,lineBreak:false})
       .text(`${findings.length}`,cols[1].x,y+3)
       .fillColor(SEV_COLOR[mx]||GRAY).text(mx,cols[2].x,y+3)
       .fillColor('#9CA3AF').text('_________________',cols[3].x,y+3).text('Pending',cols[4].x,y+3);
    y+=14;
  });

  // ── Footer ──
  const pc=doc.bufferedPageRange().count;
  for(let i=0;i<pc;i++){
    doc.switchToPage(i);
    doc.moveTo(M,PH-26).lineTo(PW-M,PH-26).strokeColor('#E5E7EB').lineWidth(0.3).stroke();
    doc.fontSize(6.5).font('Helvetica').fillColor('#9CA3AF')
       .text(`IRDAI Dark Pattern Scan · Local AI · CCPA Nov 2023 · IRDAI Apr 2026 · Page ${i+1} of ${pc}`,M,PH-20,{width:CW,align:'center'});
  }

  doc.end();
});

// Main-domain report endpoint: GET /api/report/:scanId/main-domain
router.get('/:scanId/main-domain', async (req, res) => {
  try {
    const { scanId } = req.params;

    // Verify scan exists
    const scan = db.prepare(`SELECT * FROM scans WHERE id = ?`).get(scanId);
    if (!scan) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    // Verify scan is in main-domain mode
    if (scan.scan_mode !== 'main-domain') {
      return res.status(400).json({
        error: 'Scan is not in main-domain mode',
        scanMode: scan.scan_mode,
      });
    }

    // Verify scan is complete
    if (scan.status !== 'complete') {
      return res.status(400).json({
        error: `Scan not complete. Current status: ${scan.status}`,
      });
    }

    // Verify domain_context is set
    if (!scan.domain_context) {
      return res.status(400).json({
        error: 'Scan has no domain context (required for main-domain mode)',
      });
    }

    // Generate PDF buffer
    let pdfBuffer;
    try {
      pdfBuffer = await generateDynamicReport(scanId);
    } catch (genErr) {
      console.error(`[REPORT] PDF generation failed for scan ${scanId}:`, genErr.message);
      return res.status(500).json({
        error: 'Report generation failed',
        details: genErr.message,
      });
    }

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${scan.domain_context}-${scanId.slice(0, 8)}.pdf"`
    );
    res.setHeader('Cache-Control', 'no-cache');

    // Stream PDF to response
    res.end(pdfBuffer);
  } catch (err) {
    console.error(`[REPORT] Unhandled error for main-domain report ${req.params.scanId}:`, err);
    res.status(500).json({
      error: 'Internal server error',
    });
  }
});

module.exports = router;
