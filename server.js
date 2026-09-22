const { createApp } = require('./server/app');
const app = createApp();
const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => console.log(`Kathy's Hub listening on port ${port}`));
