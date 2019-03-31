var mongoose = require('mongoose');  
var courseSchema = new mongoose.Schema({   
    course_name: String,
    start_term: String,
    end_term: String,
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
    //      answers: [{correct: Boolean, text: String}],
    //      time_duration: Number
    //      total_point: Number
    //      participation_reward_percentage: Number
    //    }],
    // },
});

module.exports = mongoose.model('Course', courseSchema);