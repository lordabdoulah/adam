const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../build'))); // خدمة ملفات البناء

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// خدمة ملفات البناء في وضع الإنتاج
  app.use(express.static(path.join(__dirname, '../build')));
  
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../build', 'index.html'));
  });


// Models
const User = require('./models/User');
const playerSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 50
    }
});

// إنشاء فهرس فريد للاسم
playerSchema.index({ name: 1 }, { unique: true });

const attendanceSchema = new mongoose.Schema({
    date: { 
        type: Date, 
        required: true,
        unique: true
    },
    data: [{
        name: { type: String, required: true },
        status: { type: String, required: true, enum: ['present', 'absent', 'late'] }
    }]
});

// إنشاء فهرس فريد للتاريخ
attendanceSchema.index({ date: 1 }, { unique: true });
// Models
const Player = mongoose.model('Player', playerSchema);
const Attendance = mongoose.model('Attendance', attendanceSchema);

// Middleware للتحقق من التكرار
const checkDuplicateDate = async (req, res, next) => {
    const { date } = req.body;
    
    try {
        const existingRecord = await Attendance.findOne({ date });
        if (existingRecord) {
            return res.status(400).json({ 
                success: false,
                message: 'Attendance record for this date already exists' 
            });
        }
        next();
    } catch (error) {
        next(error);
    }
};

// Routes


app.post('/api/players', async (req, res) => {
    const player = new Player({
        name: req.body.name
    });
    // تحقق من ان الاسم غير موجود اولا 
    try {
        const existingPlayer = await Player.findOne({ name: req.body.name });
        if (existingPlayer) {
            return res.status(400).json({ 
                success: false,
                message: 'Player with this name already exists' 
            });
        }
        const newPlayer = await player.save();
        res.status(201).json(newPlayer);
    } catch (error) {
        console.error('Error creating player:', error);
        res.status(400).json({ 
            success: false,
            message: error.message 
        });
    }
});

// Update player
app.put('/api/players/:id', async (req, res) => {
    const { newName } = req.body;
    const playerOldName = req.params.id;

    if (!newName) {
        return res.status(400).json({ 
            success: false,
            message: 'Player name is required' 
        });
    }

    try {
        const player = await Player.findOne({ name: playerOldName });
        if (!player) {
            return res.status(404).json({ 
                success: false,
                message: 'Player not found' 
            });
        }

        // التحقق من عدم وجود لاعب آخر بنفس الاسم
        const existingPlayer = await Player.findOne({ name: newName });
        if (existingPlayer) {
            return res.status(400).json({ 
                success: false,
                message: 'Player with this name already exists' 
            });
        }

        player.name = newName;
        const updatedPlayer = await player.save();

        res.json({
            success: true,
            data: updatedPlayer
        });
    } catch (error) {
        console.error('Error updating player:', error);
        res.status(400).json({ 
            success: false,
            message: error.message 
        });
    }
});

// Delete player by name
app.delete('/api/players/:name', async (req, res) => {
    const playerName = req.params.name;

    try {
        const player = await Player.findOneAndDelete({ name: playerName });
        
        if (!player) {
            return res.status(404).json({ 
                success: false,
                message: 'Player not found' 
            });
        }

        res.json({
            success: true,
            message: 'Player deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting player:', error);
        res.status(500).json({ 
            success: false,
            message: error.message 
        });
    }
});

// Attendance Routes
app.post('/api/attendance', checkDuplicateDate, async (req, res) => {
    const { date, data } = req.body;
    console.log('Received Data:', data);
    
    try {
        // التحقق مرة أخرى من وجود سجل للتاريخ
        const existingRecord = await Attendance.findOne({ date });
        if (existingRecord) {
            return res.status(400).json({ 
                success: false,
                message: 'Attendance record for this date already exists' 
            });
        }

        // إنشاء سجل جديد
        const attendance = new Attendance({
            date: new Date(date),
            data: data
        });

        console.log('Attendance Data:', attendance);
        const savedAttendance = await attendance.save();
        res.status(201).json({
            success: true,
            data: savedAttendance
        });
    } catch (error) {
        if (error.code === 11000) { // كود الخطأ الخاص بـ MongoDB للتكرار
            return res.status(400).json({ 
                success: false,
                message: 'Attendance record for this date already exists' 
            });
        }
        res.status(500).json({ 
            success: false,
            message: error.message 
        });
    }
});

// Get all attendance records
app.get('/api/attendance', async (req, res) => {
    try {
        const attendance = await Attendance.find().sort({ date: -1 });
        res.json(attendance);
    } catch (error) {
        res.status(500).json({ 
            success: false,
            message: error.message 
        });
    }
});


// Routes
// Players Routes
app.get('/api/players', async (req, res) => {
    try {
        const players = await Player.find().sort({ name: 1 });
        res.json(players);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/players', async (req, res) => {
    const player = new Player({
        name: req.body.name
    });

    try {
        const newPlayer = await player.save();
        res.status(201).json(newPlayer);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});