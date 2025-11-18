const express = require('express');
const morgan = require('morgan');

const app = express();
app.set('port', 3001);
app.set('json spaces', 2);

app.use(morgan('dev'));
app.use(express.urlencoded({extended:false}));
app.use(express.json());

app.use(require('./routes/preferencesRoute'));
app.use(require('./routes/usersRoute'));
app.use(require('./routes/specialitiesRoute'));
app.use(require('./routes/possibleTransportsRoute.js'));
app.use(require('./routes/dualStudentsRoute'));
app.use(require('./routes/companyRequestRoute'));
app.use(require('./routes/evaluationsRoute'));
app.use(require('./routes/linkingRoute'));


app.listen(app.get('port'), () => {
    console.log(`Server listening on port ${app.get('port')}`);
});