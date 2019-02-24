var mongoose = require('mongoose');  
var courseSchema = new mongoose.Schema({  
    course_code: String,
    course_name: String,
    term: String,
    description: String,
    join_code: {type: Number, index: true},
    school: String,
    instructor: String, // alphabetical order
    instructor_id: mongoose.Schema.Types.ObjectId,
    course_gradebook: Map,
    // userid : {\
    //   role: String,
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