const sequelize = require('../config/database');
const User = require('./User');
const Department = require('./Department');
const Task = require('./Task');
const TaskAttachment = require('./TaskAttachment');
const TaskComment = require('./TaskComment');
const ActivityLog = require('./ActivityLog');

// --- DEFINING ASSOCIATIONS ---

// 1. Department & User
Department.hasMany(User, { foreignKey: 'departments_id' });
User.belongsTo(Department, { foreignKey: 'departments_id' });

// 2. Department & Task
Department.hasMany(Task, { foreignKey: 'department_id' });
Task.belongsTo(Department, { foreignKey: 'department_id' });

// 3. User & Task (Creator)
User.hasMany(Task, { foreignKey: 'assigned_by', as: 'CreatedTasks' });
Task.belongsTo(User, { foreignKey: 'assigned_by', as: 'Creator' });

// 4. Task & Comment (FIXED ALIAS: 'TaskComments')
Task.hasMany(TaskComment, { foreignKey: 'task_id', as: 'TaskComments' });
TaskComment.belongsTo(Task, { foreignKey: 'task_id' });

// 5. User & Comment (Who commented)
User.hasMany(TaskComment, { foreignKey: 'user_id' });
TaskComment.belongsTo(User, { foreignKey: 'user_id' });

// 6. User & ActivityLog (Who performed action)
User.hasMany(ActivityLog, { foreignKey: 'user_id' });
ActivityLog.belongsTo(User, { foreignKey: 'user_id' });

// Export all models
module.exports = {
    sequelize,
    User,
    Department,
    Task,
    TaskAttachment,
    TaskComment,
    ActivityLog
};