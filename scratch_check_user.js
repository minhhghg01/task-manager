const { User } = require('./src/models');

async function run() {
    try {
        const users = await User.findAll();
        console.log('Total users:', users.length);
        console.log('Usernames:');
        users.forEach(u => {
            console.log(`- ID #${u.id}: ${u.username} (${u.fullname})`);
        });

        const target = await User.findOne({ where: { username: 'truongphong_it' } });
        if (target) {
            console.log('Found user truongphong_it:', target.toJSON());
        } else {
            console.log('truongphong_it NOT found!');
        }
    } catch (err) {
        console.error(err);
    }
    process.exit(0);
}

run();
