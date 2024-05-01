const jwt = require('jsonwebtoken');

module.exports = function verifyToken(req, res, next) {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(401).send('Unauthorized');
    }

    jwt.verify(token, 'vishal@12#', (err, decoded) => {
        if (err) {
            return res.status(401).send('Unauthorized');
        }

        // Attach decoded data to request object for further use
        req.user = decoded;
        next();
    });
};
