var mongoose = require('mongoose');  
var courseSchema = new mongoose.Schema({   
    course_name: String,
    term: String,
    description: String,
    join_code: {type: Number, index: true},
    number_of_students: Number,
    number_of_lectures: Number,
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
    //   id: String,
    //   class_date: String,
    //   finished: Boolean,
    //   description: String,
    //   quizzes: [{
    //      question: String,
    //      possible_answers: [String],
    //      correct_answer: Number,
    //      question_number: Number,
    //      time_duration: Number
    //      participation_reward: Number
    //    }],
    // },
});

module.exports = mongoose.model('Course', courseSchema);