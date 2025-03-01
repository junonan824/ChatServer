const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  createdBy: String,
  created: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Room', roomSchema); 