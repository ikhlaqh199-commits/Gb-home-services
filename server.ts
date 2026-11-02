/**
 * GB Home Services - Gilgit-Baltistan Platform
 * Fullstack Dev & Production Server Entry Point
 * Powered by Express & SQLite (gb_homeservices.db)
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs, { Database } from 'sql.js';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const dbPath = path.resolve(__dirname, 'gb_homeservices.db');
let db: Database;

function saveDatabase() {
  if (!db) return;
  try {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  } catch (err: any) {
    console.error('Error saving SQLite database to disk:', err.message);
  }
}

// Database Helper Functions
function dbRun(sql: string, params: any[] = []): { lastID: number; changes: number } {
  db.run(sql, params);
  const lastIdRes = db.exec('SELECT last_insert_rowid() as id');
  const lastID = lastIdRes.length && lastIdRes[0].values.length ? Number(lastIdRes[0].values[0][0]) : 0;
  const changesRes = db.exec('SELECT changes() as ch');
  const changes = changesRes.length && changesRes[0].values.length ? Number(changesRes[0].values[0][0]) : 0;
  saveDatabase();
  return { lastID, changes };
}

function dbAll(sql: string, params: any[] = []): any[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function dbGet(sql: string, params: any[] = []): any | null {
  const rows = dbAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

async function initializeDatabase() {
  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    try {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(buffer);
      console.log('✅ Loaded existing SQLite database from:', dbPath);
    } catch (e) {
      console.warn('Could not read existing db, initializing fresh:', e);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
    console.log('✅ Initialized new SQLite database at:', dbPath);
  }

  // Create tables as required
  db.run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      district TEXT NOT NULL,
      area TEXT NOT NULL,
      service TEXT NOT NULL,
      slot TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      notes TEXT,
      status TEXT DEFAULT 'Pending',
      rating INTEGER,
      review TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrate existing bookings table if rating or review columns are missing
  try {
    const tableInfo = dbAll('PRAGMA table_info(bookings)');
    const colNames = tableInfo.map((c: any) => c.name);
    if (!colNames.includes('rating')) {
      db.run('ALTER TABLE bookings ADD COLUMN rating INTEGER');
      console.log('✅ Added "rating" column to bookings table');
    }
    if (!colNames.includes('review')) {
      db.run('ALTER TABLE bookings ADD COLUMN review TEXT');
      console.log('✅ Added "review" column to bookings table');
    }
  } catch (migErr: any) {
    console.warn('Migration check note:', migErr.message);
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS workers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      cnic TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      district TEXT NOT NULL,
      area TEXT,
      trade TEXT NOT NULL,
      experience TEXT NOT NULL,
      bio TEXT,
      rate TEXT DEFAULT 'Rs. 500 Visit Fee',
      skills TEXT,
      availability TEXT DEFAULT 'Available Now',
      status TEXT DEFAULT 'Verified & Active',
      registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrate workers table if bio, rate, skills, area, availability columns are missing
  try {
    const workerInfo = dbAll('PRAGMA table_info(workers)');
    const wCols = workerInfo.map((c: any) => c.name);
    if (!wCols.includes('bio')) {
      db.run('ALTER TABLE workers ADD COLUMN bio TEXT');
    }
    if (!wCols.includes('rate')) {
      db.run("ALTER TABLE workers ADD COLUMN rate TEXT DEFAULT 'Rs. 500 Visit Fee'");
    }
    if (!wCols.includes('skills')) {
      db.run('ALTER TABLE workers ADD COLUMN skills TEXT');
    }
    if (!wCols.includes('area')) {
      db.run('ALTER TABLE workers ADD COLUMN area TEXT');
    }
    if (!wCols.includes('availability')) {
      db.run("ALTER TABLE workers ADD COLUMN availability TEXT DEFAULT 'Available Now'");
    }

    // Ensure initial workers have complete profile data
    db.run(`
      UPDATE workers SET 
        bio = CASE 
          WHEN trade LIKE '%Plumber%' THEN '10+ years expert in sub-zero alpine plumbing. Specialized in hot water pressure thawing for frozen intake lines in Skardu and Hunza, PPRC heat welds, and winter stopcocks.'
          WHEN trade LIKE '%Electrician%' THEN 'Certified electrician with 7+ years wiring dual-line generator transfer switches, ATS automation, breaker load balancing, and high-altitude solar battery arrays.'
          WHEN trade LIKE '%Carpenter%' THEN 'Himalayan cedar woodcraft master. Skilled in sealing mountain homes against cold valley drafts, window sash weatherstripping, and custom kitchen cabinetry.'
          WHEN trade LIKE '%Welder%' THEN 'Specialized metal fabricator and welder (Worder). Custom builds winter Bukhari wood stoves, heavy steel security grills, iron gates, and high-strength pipe welding.'
          WHEN trade LIKE '%House%' OR trade LIKE '%Servant%' THEN 'Police-cleared trusted domestic assistant (Servernt) with 5+ years experience assisting families in winter home maintenance, Bukhari chimney soot clearing, and seasonal snow clearance.'
          ELSE 'Certified skilled tradesman serving homes across Gilgit-Baltistan with police verification and standard Rs. 500 inspection fee.'
        END,
        skills = CASE
          WHEN trade LIKE '%Plumber%' THEN 'Frozen Pipe Thawing, PPRC Heat Welds, Sanitary & Drain Valves, Gravity Water Boosters'
          WHEN trade LIKE '%Electrician%' THEN 'Generator Changeover ATS, Breaker Panels, Short-Circuit Fixes, Solar Inverters'
          WHEN trade LIKE '%Carpenter%' THEN 'Cedar Doors & Windows, Draft Weatherstripping, Roofing Timber, Kitchen Cabinets'
          WHEN trade LIKE '%Welder%' THEN 'Bukhari Stoves Fabrication, Steel Security Grills, Iron Gates, Heavy Pipe Welding'
          WHEN trade LIKE '%House%' OR trade LIKE '%Servant%' THEN 'Bukhari Chimney Soot Removal, Seasonal Snow Clearance, Domestic Cleaning, Household Support'
          ELSE 'General Home Maintenance, Alpine Repairs, Cold-Climate Tools'
        END,
        rate = 'Rs. 500 Visit Fee',
        availability = 'Available Now',
        status = 'Verified & Active'
      WHERE bio IS NULL OR skills IS NULL;
    `);

    // Backfill any null areas with district central locations
    db.run(`
      UPDATE workers SET area = CASE district 
        WHEN 'Gilgit' THEN 'Jutial Officers Colony' 
        WHEN 'Skardu' THEN 'Sadpara Road' 
        WHEN 'Hunza' THEN 'Aliabad Main Bazaar' 
        WHEN 'Ghizer' THEN 'Gahkuch Khas' 
        WHEN 'Nagar' THEN 'Chalt Central' 
        WHEN 'Kharmang' THEN 'Tolti Administrative Area' 
        WHEN 'Gupis' THEN 'Gupis Khas' 
        ELSE 'Central Area' 
      END WHERE area IS NULL OR area = '';
    `);

    // Ensure Welder is present if not already added
    const hasWelder = dbGet("SELECT id FROM workers WHERE trade LIKE '%Welder%'");
    if (!hasWelder) {
      db.run(
        `INSERT INTO workers (full_name, cnic, phone, district, area, trade, experience, bio, rate, skills, availability, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'Murtaza Ali Balti',
          '71101-5544332-1',
          '0355-4433221',
          'Skardu',
          'Sadpara Road',
          'Welder / Metal Fabricator',
          '8+ Years Master Fabricator',
          'Specialized metal fabricator and welder (Worder). Custom builds winter Bukhari wood stoves, heavy steel security grills, iron gates, and high-strength pipe welding.',
          'Rs. 500 Visit Fee',
          'Bukhari Stoves Fabrication, Steel Security Grills, Iron Gates, Heavy Pipe Welding',
          'Available Now',
          'Verified & Active'
        ]
      );
    }
  } catch (migErr: any) {
    console.warn('Worker migration notice:', migErr.message);
  }

  // Seed initial data if empty
  const countRow = dbGet('SELECT COUNT(*) as count FROM workers');
  if (countRow && countRow.count === 0) {
    console.log('Seeding initial verified workers and sample bookings across Gilgit-Baltistan...');
    const initialWorkers = [
      ['Ghulam Raza Balti', '71101-8765432-3', '0355-5123456', 'Skardu', 'Sadpara Road', 'Plumber', '10+ Years (Sub-zero Thawing)', '10+ years expert in sub-zero alpine plumbing. Specialized in hot water pressure thawing for frozen intake lines in Skardu and Hunza, PPRC heat welds, and winter stopcocks.', 'Rs. 500 Visit Fee', 'Frozen Pipe Thawing, PPRC Heat Welds, Sanitary & Drain Valves, Gravity Water Boosters', 'Available Now', 'Verified & Active'],
      ['Ali Haider Shigri', '71501-1234567-1', '0345-9871234', 'Gilgit', 'Jutial Officers Colony', 'Electrician', '7+ Years (ATS & Solar Certified)', 'Certified electrician with 7+ years wiring dual-line generator transfer switches, ATS automation, breaker load balancing, and high-altitude solar battery arrays.', 'Rs. 500 Visit Fee', 'Generator Changeover ATS, Breaker Panels, Short-Circuit Fixes, Solar Inverters', 'Available Now', 'Verified & Active'],
      ['Sher Baz Ghizeri', '71301-4433221-7', '0346-7788990', 'Ghizer', 'Gahkuch Khas', 'Carpenter', '8+ Years (Cedar Draft Sealing)', 'Himalayan cedar woodcraft master. Skilled in sealing mountain homes against cold valley drafts, window sash weatherstripping, and custom kitchen cabinetry.', 'Rs. 500 Visit Fee', 'Cedar Doors & Windows, Draft Weatherstripping, Roofing Timber, Kitchen Cabinets', 'Available Now', 'Verified & Active'],
      ['Murtaza Ali Balti', '71101-5544332-1', '0355-4433221', 'Skardu', 'Yadgar Chowk', 'Welder / Metal Fabricator', '8+ Years Master Fabricator', 'Specialized metal fabricator and welder (Worder). Custom builds winter Bukhari wood stoves, heavy steel security grills, iron gates, and high-strength pipe welding.', 'Rs. 500 Visit Fee', 'Bukhari Stoves Fabrication, Steel Security Grills, Iron Gates, Heavy Pipe Welding', 'Available Now', 'Verified & Active'],
      ['Zakir Mehdi Kharmangi', '71601-3322114-1', '0342-1122334', 'Kharmang', 'Tolti Administrative Area', 'House Servant & Helper', '5+ Years Domestic Support', 'Police-cleared trusted domestic assistant (Servernt) with 5+ years experience assisting families in winter home maintenance, Bukhari chimney soot clearing, and seasonal snow clearance.', 'Rs. 500 Visit Fee', 'Bukhari Chimney Soot Removal, Seasonal Snow Clearance, Domestic Cleaning, Household Support', 'Available Now', 'Verified & Active'],
      ['Nissar Hussain Nagari', '71401-6549871-9', '0355-6677889', 'Nagar', 'Chalt Central', 'Painter & Weatherproofing', '6+ Years Exterior Coatings', 'Specialist in alpine moisture barriers, damp-proofing traditional stone walls, and high-altitude weather-resistant coatings.', 'Rs. 500 Visit Fee', 'Exterior Frost Paint, Stone Wall Damp-Proofing, Wood Varnishing, Moisture Barrier', 'Available Now', 'Verified & Active']
    ];

    initialWorkers.forEach((w) => {
      db.run(
        `INSERT INTO workers (full_name, cnic, phone, district, area, trade, experience, bio, rate, skills, availability, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        w
      );
    });

    const initialBookings = [
      ['Sultan Ahmad', '0344-9081234', 'Gilgit', 'Jutial Officers Colony', 'Electrician (ATS & Generator Changeover)', 'Tomorrow Morning (09:00 - 12:00)', 'Cash on Visit', 'Winter changeover switch installation for 7kVA generator.', 'Confirmed'],
      ['Fatima Zahra', '0355-4819201', 'Skardu', 'Yadgar Chowk Old City', 'Plumber (Sub-Zero Pipe Thawing)', 'Immediate Emergency (< 2 Hours)', 'EasyPaisa / JazzCash', 'External bathroom intake pipes completely frozen due to -12°C night.', 'In Progress'],
      ['Mirza Baig', '0312-7654321', 'Hunza', 'Aliabad Main Bazaar', 'Carpenter (Cedar Draft Weatherstripping)', 'Tomorrow Afternoon (12:00 - 15:00)', 'Cash on Visit', 'Seal cedar doors and balcony windows to stop sub-zero valley drafts.', 'Pending'],
      ['Inayat Ullah', '0348-1239874', 'Ghizer', 'Gahkuch Khas', 'Plumber (Master Shutoffs & Valves)', 'Tomorrow Evening (15:00 - 18:00)', 'Cash on Visit', 'Install drain valves and insulated jacket for water reservoir line.', 'Completed', 5, 'Arrived promptly in Gahkuch. Expertly installed the winter drain valves and insulated our reservoir pipe before snow arrived.']
    ];

    initialBookings.forEach((b) => {
      db.run(
        `INSERT INTO bookings (customer_name, phone, district, area, service, slot, payment_method, notes, status, rating, review) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        b
      );
    });

    saveDatabase();
  }
}

// ================= API ENDPOINTS ================= //

/**
 * POST /api/bookings
 * Submit a new service booking request
 */
app.post('/api/bookings', (req: Request, res: Response) => {
  const { customer_name, phone, district, area, service, slot, payment_method, notes } = req.body;

  if (!customer_name || !phone || !district || !area || !service || !slot || !payment_method) {
    return res.status(400).json({
      success: false,
      error: 'Missing required booking fields. Please complete all required inputs.'
    });
  }

  const phoneClean = String(phone).trim();
  if (phoneClean.length < 10) {
    return res.status(400).json({
      success: false,
      error: 'Please enter a valid active contact phone number (e.g., 03xx-xxxxxxx).'
    });
  }

  try {
    const query = `
      INSERT INTO bookings (customer_name, phone, district, area, service, slot, payment_method, notes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')
    `;

    const { lastID } = dbRun(query, [
      String(customer_name).trim(),
      phoneClean,
      String(district).trim(),
      String(area).trim(),
      String(service).trim(),
      String(slot).trim(),
      String(payment_method).trim(),
      notes ? String(notes).trim() : ''
    ]);

    const districtPrefix = String(district).slice(0, 3).toUpperCase();
    const bookingCode = `GB-${districtPrefix}-${String(lastID).padStart(4, '0')}`;

    res.status(201).json({
      success: true,
      message: 'Booking submitted successfully! A verified technician will call for dispatch confirmation.',
      bookingId: lastID,
      bookingCode,
      data: {
        id: lastID,
        bookingCode,
        customer_name,
        phone: phoneClean,
        district,
        area,
        service,
        slot,
        payment_method,
        inspection_fee: 500,
        status: 'Pending',
        created_at: new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error('Error inserting booking:', err.message);
    res.status(500).json({ success: false, error: 'Database error saving booking request.' });
  }
});

/**
 * GET /api/bookings
 * Fetch all bookings for management and dashboard
 */
app.get('/api/bookings', (req: Request, res: Response) => {
  const { district, status, search } = req.query;
  let query = 'SELECT * FROM bookings WHERE 1=1';
  const params: any[] = [];

  if (district && district !== 'All') {
    query += ' AND district = ?';
    params.push(String(district));
  }

  if (status && status !== 'All') {
    query += ' AND status = ?';
    params.push(String(status));
  }

  if (search) {
    query += ' AND (customer_name LIKE ? OR phone LIKE ? OR area LIKE ? OR service LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  query += ' ORDER BY id DESC';

  try {
    const rows = dbAll(query, params);
    res.json({
      success: true,
      count: rows.length,
      bookings: rows
    });
  } catch (err: any) {
    console.error('Error querying bookings:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch bookings.' });
  }
});

/**
 * PATCH /api/bookings/:id/status
 * Update status of an existing booking
 */
app.patch('/api/bookings/:id/status', (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const validStatuses = ['Pending', 'Confirmed', 'In Progress', 'Completed', 'Cancelled'];

  if (!status || !validStatuses.includes(String(status))) {
    return res.status(400).json({
      success: false,
      error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
    });
  }

  try {
    const { changes } = dbRun('UPDATE bookings SET status = ? WHERE id = ?', [String(status), Number(id)]);
    if (changes === 0) {
      return res.status(404).json({ success: false, error: 'Booking not found.' });
    }

    res.json({
      success: true,
      message: `Booking #${id} status updated to ${status}.`
    });
  } catch (err: any) {
    console.error('Error updating booking status:', err.message);
    res.status(500).json({ success: false, error: 'Failed to update booking status.' });
  }
});

/**
 * POST /api/bookings/:id/review
 * Submit a customer rating and review for a completed service booking
 */
app.post('/api/bookings/:id/review', (req: Request, res: Response) => {
  const { id } = req.params;
  const { rating, review } = req.body;

  const numRating = Number(rating);
  if (isNaN(numRating) || numRating < 1 || numRating > 5) {
    return res.status(400).json({
      success: false,
      error: 'Rating must be an integer between 1 and 5 stars.'
    });
  }

  try {
    const booking = dbGet('SELECT * FROM bookings WHERE id = ?', [Number(id)]);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found.'
      });
    }

    if (booking.status !== 'Completed') {
      return res.status(400).json({
        success: false,
        error: 'Ratings and reviews can only be submitted for jobs that are marked as Completed.'
      });
    }

    dbRun('UPDATE bookings SET rating = ?, review = ? WHERE id = ?', [
      Math.round(numRating),
      review ? String(review).trim() : '',
      Number(id)
    ]);

    const updated = dbGet('SELECT * FROM bookings WHERE id = ?', [Number(id)]);

    res.json({
      success: true,
      message: 'Thank you! Your feedback and review have been recorded.',
      data: updated
    });
  } catch (err: any) {
    console.error('Error recording review:', err.message);
    res.status(500).json({ success: false, error: 'Failed to record rating and review.' });
  }
});

/**
 * GET /api/reviews
 * Fetch all verified customer reviews
 */
app.get('/api/reviews', (_req: Request, res: Response) => {
  try {
    const rows = dbAll('SELECT id, customer_name, district, area, service, rating, review, created_at FROM bookings WHERE rating IS NOT NULL AND rating > 0 ORDER BY id DESC');
    res.json({
      success: true,
      count: rows.length,
      reviews: rows
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch reviews.' });
  }
});

/**
 * POST /api/workers
 * Register a new tradesman/partner with profession and profile
 */
app.post('/api/workers', (req: Request, res: Response) => {
  const { full_name, cnic, phone, district, area, trade, experience, bio, rate, skills } = req.body;

  if (!full_name || !cnic || !phone || !district || !trade || !experience) {
    return res.status(400).json({
      success: false,
      error: 'All fields (Full Name, CNIC, Phone, District, Trade, Experience) are required.'
    });
  }

  const cnicClean = String(cnic).replace(/[^0-9]/g, '');
  if (cnicClean.length !== 13) {
    return res.status(400).json({
      success: false,
      error: 'CNIC must be exactly 13 digits (format: 71xxx-xxxxxxx-x).'
    });
  }

  const formattedCnic = `${cnicClean.slice(0, 5)}-${cnicClean.slice(5, 12)}-${cnicClean.slice(12)}`;

  // Check unique CNIC
  const existing = dbGet('SELECT id FROM workers WHERE cnic = ?', [formattedCnic]);
  if (existing) {
    return res.status(409).json({
      success: false,
      error: 'A technician with this CNIC is already registered in the GB database.'
    });
  }

  try {
    const defaultBio = bio ? String(bio).trim() : `Professional ${trade} with ${experience} experience serving homeowners in ${district}, Gilgit-Baltistan.`;
    const defaultSkills = skills ? String(skills).trim() : `${trade} diagnosis, repairs, and installations`;
    const defaultRate = rate ? String(rate).trim() : 'Rs. 500 Visit Fee';
    const defaultArea = area ? String(area).trim() : String(district).trim();

    const query = `
      INSERT INTO workers (full_name, cnic, phone, district, area, trade, experience, bio, rate, skills, availability, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available Now', 'Verified & Active')
    `;

    const { lastID } = dbRun(query, [
      String(full_name).trim(),
      formattedCnic,
      String(phone).trim(),
      String(district).trim(),
      defaultArea,
      String(trade).trim(),
      String(experience).trim(),
      defaultBio,
      defaultRate,
      defaultSkills
    ]);

    res.status(201).json({
      success: true,
      workerId: lastID,
      message: 'Profession profile created successfully! You are now listed on GB Home Services directory.',
      data: {
        id: lastID,
        full_name,
        cnic: formattedCnic,
        phone,
        district,
        area: defaultArea,
        trade,
        experience,
        bio: defaultBio,
        rate: defaultRate,
        skills: defaultSkills,
        status: 'Verified & Active',
        registered_at: new Date().toISOString()
      }
    });
  } catch (err: any) {
    console.error('Error inserting worker:', err.message);
    res.status(500).json({ success: false, error: 'Database error registering technician.' });
  }
});

/**
 * GET /api/workers
 * Fetch all registered workers with profile details
 */
app.get('/api/workers', (req: Request, res: Response) => {
  const { district, trade, status } = req.query;
  let query = 'SELECT id, full_name, cnic, phone, district, area, trade, experience, bio, rate, skills, availability, status, registered_at FROM workers WHERE 1=1';
  const params: any[] = [];

  if (district && district !== 'All') {
    query += ' AND district = ?';
    params.push(String(district));
  }

  if (trade && trade !== 'All') {
    query += ' AND trade LIKE ?';
    params.push(`%${String(trade)}%`);
  }

  if (status && status !== 'All') {
    query += ' AND status = ?';
    params.push(String(status));
  }

  query += ' ORDER BY id DESC';

  try {
    const rows = dbAll(query, params);
    const maskedRows = rows.map((r) => ({
      ...r,
      cnic_masked: r.cnic ? `${String(r.cnic).slice(0, 5)}-*******-${String(r.cnic).slice(-1)}` : 'N/A'
    }));

    res.json({
      success: true,
      count: maskedRows.length,
      workers: maskedRows
    });
  } catch (err: any) {
    console.error('Error querying workers:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch workers.' });
  }
});

/**
 * GET /api/workers/:id
 * Fetch complete public profile for a single tradesman
 */
app.get('/api/workers/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const worker = dbGet('SELECT * FROM workers WHERE id = ?', [Number(id)]);
    if (!worker) {
      return res.status(404).json({ success: false, error: 'Tradesman profile not found.' });
    }

    res.json({
      success: true,
      worker: {
        ...worker,
        cnic_masked: worker.cnic ? `${String(worker.cnic).slice(0, 5)}-*******-${String(worker.cnic).slice(-1)}` : 'N/A'
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch worker profile.' });
  }
});

/**
 * GET /api/stats
 */
app.get('/api/stats', (_req: Request, res: Response) => {
  const stats = {
    totalBookings: 0,
    pendingBookings: 0,
    completedBookings: 0,
    verifiedWorkers: 0,
    districtsCovered: 7
  };

  try {
    const bRow = dbGet(
      'SELECT COUNT(*) as total, SUM(CASE WHEN status = "Pending" THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN status = "Completed" THEN 1 ELSE 0 END) as completed FROM bookings'
    );
    if (bRow) {
      stats.totalBookings = bRow.total || 0;
      stats.pendingBookings = bRow.pending || 0;
      stats.completedBookings = bRow.completed || 0;
    }

    const wRow = dbGet('SELECT COUNT(*) as total FROM workers WHERE status = "Verified & Active"');
    if (wRow) {
      stats.verifiedWorkers = wRow.total || 0;
    }

    res.json({ success: true, stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch stats.' });
  }
});

// Start Server and mount Vite or Static
async function startServer() {
  await initializeDatabase();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.use(express.static(__dirname));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏔️ GB Home Services Server running on http://localhost:${PORT}`);
  });
}

startServer();
