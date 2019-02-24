var mongoose = require('mongoose');  
var courseSchema = new mongoose.Schema({  
  course_code: String,
  course_name: String,
  join_code: String,
  school: String,
  instructors: String, // alphabetical order
  course_gradebook: Map,
    // userid : {
    //   overall: Number,
    //   lectures_grade: [{date: Date, grade: Number}],
    // }
  lectures: []

    // {
    //   date: Date,
    //   finished: Boolean,
    //   title: String,
    //   quizzes: [{
    //      question: String,
    //      answer_options: {A: String, },
    //      correct_answer: String,
    //      time_duration: Number
    //      participation_reward: Number
    //    }],
    // },
});

module.exports = mongoose.model('Course', courseSchema);