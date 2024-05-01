const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const fs = require('fs');



const app = express();
const port = 7000;
app.use(bodyParser.urlencoded({ extended: true }));

// Multer setup for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname)
    }
});

const upload = multer({ storage: storage });

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use("/style" ,express.static('style'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());


function generateOrderID() {
    return uuidv4(); // Generates a unique ID
}

const con = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'kumar',
    database: 'merchant_db'
});

con.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL database:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

// Generate JWT token
function generateToken(user) {
    return jwt.sign({ id: user.id, email: user.email }, 'vishal@123', { expiresIn: '48h' });
}

app.post('/', (req, res) => {
    const { email, password } = req.body;

    const sql = 'SELECT * FROM users WHERE email = ? AND password = ?';
    con.query(sql, [email, password], (err, results) => {
        if (err) {
            console.error('Error executing MySQL query:', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        if (results.length > 0) {
             const user = results[0];
            const token = generateToken(user);
            
            // Set token in cookie
            res.cookie('token', token, { httpOnly: true });
            res.redirect('/home'); // Redirect to home page upon successful login
        } else {
            res.status(401).send('Invalid email or password');
        }
    });
});

app.post('/submit_form', (req, res) => {
    const { email, firstname, lastname, password } = req.body;

    // Check if the email already exists in the database
    const checkEmailQuery = 'SELECT * FROM users WHERE email = ?';
    con.query(checkEmailQuery, [email], (checkErr, checkResult) => {
        if (checkErr) {
            console.error('Error checking email:', checkErr);
            res.status(500).send('Internal Server Error');
            return;
        }

        // If the email already exists, display an error
        if (checkResult.length > 0) {
            res.status(400).send('Email already exists');
            return;
        }

        // Generate id for the new user
        const id = Math.floor(Math.random() * 1000000); // Generate a random id for simplicity, you might want a more robust method

        // Insert new user into the database
        const insertQuery = 'INSERT INTO users (id, email, firstname, lastname, password) VALUES (?, ?, ?, ?, ?)';
        con.query(insertQuery, [id, email, firstname, lastname, password], (insertErr, insertResult) => {
            if (insertErr) {
                console.error('Error inserting data into MySQL:', insertErr);
                res.status(500).send('Internal Server Error');
                return;
            }

            console.log('User registered successfully');

            // Generate JWT token for the new user
            const user = { id, email };
            const token = generateToken({ id, email });

            // Set token in cookie
            res.cookie('token', token, { httpOnly: true });
            res.redirect('/'); // Redirect to login page upon successful signup
        });
    });
});

app.get('/home', (req, res) => {
    // Get token from cookie
    const token = req.cookies.token;

    // Verify token
    jwt.verify(token, 'vishal@123', (err, decoded) => {
        if (err) {
            return res.status(401).send('Unauthorized');
        }

        // Token is valid, proceed to render home page
        const sql = 'SELECT * FROM products';
        con.query(sql, (err, results) => {
            if (err) {
                console.error('Error executing MySQL query:', err);
                res.status(500).send('Internal Server Error');
                return;
            }
            results.forEach(product => {
                if (product.image) {
                    // Convert BLOB data to base64 string
                    const imageBase64 = Buffer.from(product.image, 'binary').toString('base64');
                    // Add base64 string to product object
                    product.image = `data:image/jpeg;base64,${imageBase64}`;
                }
            });
            res.render('home', { products: results });
        });
    });
});

app.post('/order', (req, res) => {
    const productId = req.body.productId;
    const quantity = req.body.quantity;
    const orderId = generateOrderID(); // Your existing function to generate an order ID

    // Get token from cookie
    const token = req.cookies.token;

    // Verify token to decode user's email
    jwt.verify(token, 'vishal@123', (err, decoded) => {
        if (err) {
            console.error('Error verifying JWT token:', err);
            return res.status(401).send('Unauthorized');
        }

        // Extract user's email from decoded token
        const userEmail = decoded.email;

        // Fetch product details from the database
        const productQuery = 'SELECT name FROM products WHERE id = ?';
        con.query(productQuery, [productId], (productErr, productResult) => {
            if (productErr) {
                console.error('Error fetching product details:', productErr);
                res.status(500).send('Internal Server Error');
                return;
            }

            // Insert order into the database
            const insertOrderQuery = 'INSERT INTO orders (order_id, product_id, quantity, email, product_name) VALUES (?, ?, ?, ?, ?)';
            con.query(insertOrderQuery, [orderId, productId, quantity, userEmail, productResult[0].name], (insertErr, insertResult) => {
                if (insertErr) {
                    console.error('Error adding product to order:', insertErr);
                    res.status(500).send('Internal Server Error');
                    return;
                }

                console.log('Product added to order successfully');
                // Redirect or send response as needed
            });
        });
    });
});
 





app.get('/cart', (req, res) => {
    // Get token from cookie
    const token = req.cookies.token;

    // Verify token to decode user's email
    jwt.verify(token, 'vishal@123', (err, decoded) => {
        if (err) {
            console.error('Error verifying JWT token:', err);
            return res.status(401).send('Unauthorized');
        }

        // Extract user's email from decoded token
        const userEmail = decoded.email;

        // Query to fetch cart items for the logged-in user
        const sql = `
            SELECT orders.*, products.name, products.price, products.image 
            FROM orders 
            JOIN products ON orders.product_id = products.id 
            WHERE orders.email = ?
        `;
        con.query(sql, [userEmail], (err, results) => {
            if (err) {
                console.error('Error fetching cart data:', err);
                res.status(500).send('Internal Server Error');
                return;
            }

            results.forEach(item => {
                if (item.image) {
                    // Convert BLOB data to base64 string
                    const imageBase64 = Buffer.from(item.image, 'binary').toString('base64');
                    // Add base64 string to item object
                    item.image = `data:image/jpeg;base64,${imageBase64}`;
                }
            });

            const cartData = { orders: results }; // Ensure that 'orders' key is present in the cartData object
            res.render('cart.ejs', { cartData });
        });
    });
});


app.post('/remove', (req, res) => {
    const orderId = req.body.orderId;
    console.log('Removing product from order with ID:', orderId);
    const sql = 'DELETE FROM orders WHERE order_id = ?';
    con.query(sql, [orderId], (err, result) => {
        if (err) {
            console.error('Error removing product from order:', err);
            return;
        }
        console.log('Product removed from order successfully');
    });
});


app.get('/profile', (req, res) => {
    // Get token from cookie
    const token = req.cookies.token;

    // Verify token to decode user's email
    jwt.verify(token, 'vishal@123', (err, decoded) => {
        if (err) {
            console.error('Error verifying JWT token:', err);
            return res.status(401).send('Unauthorized');
        }

        // Extract user's email from decoded token
        const userEmail = decoded.email;

        // Fetch user details and their order details using a JOIN query
        const sql = `
            SELECT *  FROM users
            WHERE users.email = ?
        `;
        con.query(sql, [userEmail], (err, results) => {
            if (err) {
                console.error('Error fetching user and order details:', err);
                res.status(500).send('Internal Server Error');
                return;
            }

            // If user and order details are found, render the profile page with the data
            if (results.length > 0) {
                const userData = results[0];
                res.render('profile', { user: userData });
            } else {
                // If no order details are found, render a message indicating that the user should go shopping
                res.render('profile', { user: null, message: 'Nothing to deliver. Please go shopping!' });
            }
        });
    });
});

// In your Node.js/Express application


        

app.get('/admin', (req, res) => {
    con.query('SELECT * FROM products', (error, results, fields) => {
        if (error) throw error;
        results.forEach(product => {
            if (product.image) {
                // Convert BLOB data to base64 string
                const imageBase64 = Buffer.from(product.image, 'binary').toString('base64');
                // Add base64 string to product object
                product.image = `data:image/jpeg;base64,${imageBase64}`;
            }
        });
        res.render('admin', { products: results });
    });
});


  // app.js

app.get('/admin/delete/:id', (req, res) => {
    const productId = req.params.id;
    con.query('DELETE FROM products WHERE id = ?', [productId], (error, results, fields) => {
      if (error) throw error;
      console.log(`Deleted product with ID ${productId}`);
      res.redirect('/admin');
    });
  });

  app.get('/delivery', (req, res) => {
    const query = `SELECT * FROM checkout_info`;

    con.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching delivered orders:', err);
            return res.status(500).send('Error fetching delivered orders');
        }

        res.render('admin_delivery', { orders: results });
    });
});

app.post('/mark_delivered', (req, res) => {
    const orderId = req.body.orderId;
    const updateQuery = `UPDATE checkout_info SET status = 'Delivered' WHERE order_id = ?`;

    con.query(updateQuery, [orderId], (err, result) => {
        if (err) {
            console.error('Error updating status to Delivered:', err);
            return res.status(500).send('Error updating status to Delivered');
        }
        res.redirect('/admin');
    });
});

  
  app.post('/admin/add_product', upload.single('image'), async (req, res) => {
    const { id, name, description, price, qty } = req.body;
    const imagePath = req.file.path;
    const product = { id, name, description, price, qty };

    try {
        const blobData = await convertImageToBlob(imagePath);
        if (blobData.length > 10485760) { // Check if image size is greater than 10MB (10485760 bytes)
            throw new Error('Image size should be less than 10MB');
        }
        await insertProduct(product, blobData);
        console.log('Product added successfully');
        res.redirect('/admin');
    } catch (error) {
        console.error('Error adding product:', error);
        res.redirect('/admin');
    }
});

// Read image file and convert to BLOB
async function convertImageToBlob(imagePath) {
    try {
        return await readFile(imagePath);
    } catch (error) {
        throw error;
    }
}

// Insert product with image BLOB data into MySQL
async function insertProduct(product, blobData) {
    try {
        const results = await new Promise((resolve, reject) => {
            con.query('INSERT INTO products SET ?', product, (error, results, fields) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(results);
                }
            });
        });
        const productId = results.insertId;
        await new Promise((resolve, reject) => {
            con.query('UPDATE products SET image = ? WHERE id = ?', [blobData, productId], (err, results, fields) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    } catch (error) {
        throw error;
    }
}

app.post('/process_order', (req, res) => {
    const token = req.cookies.token;

    // Verify token to decode user's email
    jwt.verify(token, 'vishal@123', (err, decoded) => {
        if (err) {
            console.error('Error verifying JWT token:', err);
            return res.status(401).send('Unauthorized');
        }

        // Extract user's email from decoded token
        const userEmail = decoded.email;

        const productName = req.body.productName;
        const quantity = req.body.quantity;
        const price = req.body.price;
        const orderId = uuidv4();

        const query = `INSERT INTO shiping (order_id, product_name, quantity, price, user_email) VALUES (?, ?, ?, ?, ?)`;
        con.query(query, [orderId, productName, quantity, price, userEmail], (err, result) => {
            if (err) {
                console.error('Error inserting order data:', err);
                return res.status(500).send('Error processing order');
            }
            
            res.redirect(`/checkout?orderId=${orderId}`);
        });
    });
});


app.get('/checkout', (req, res) => {
    const token = req.cookies.token;

    // Verify token to decode user's email
    jwt.verify(token, 'vishal@123', (err, decoded) => {
        if (err) {
            console.error('Error verifying JWT token:', err);
            return res.status(401).send('Unauthorized');
        }

        // Extract user's email from decoded token
        const userEmail = decoded.email;

        // Query to fetch cart items for the logged-in user from the shipping table
        const sql = `
            SELECT * FROM shiping
            WHERE user_email = ?
        `;
        con.query(sql, [userEmail], (err, results) => {
            if (err) {
                console.error('Error fetching shipping data:', err);
                res.status(500).send('Internal Server Error');
                return;
            }

            const cartData = { shiping: results }; // Ensure that 'shiping' key is present in the cartData object
            const orderId = req.query.orderId; // Get orderId from query parameters
            res.render('checkout', { cartData, orderId }); // Pass cartData and orderId to the checkout page
        });
    });
});


app.post('/submit_checkout_form', (req, res) => {
    const token = req.cookies.token;
    // Verify token to decode user's email
    jwt.verify(token, 'vishal@123', (err, decoded) => {
        if (err) {
            console.error('Error verifying JWT token:', err);
            return res.status(401).send('Unauthorized');
        }

        // Extract user's email from decoded token
        const userEmail = decoded.email;
        const { firstName, lastName, address, mobile, email, pincode, orderId } = req.body;
        const query = `
            INSERT INTO checkout_info 
                (order_id, first_name, last_name, address, mobile, email, pincode, status) 
            VALUES 
                (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        con.query(query, [orderId, firstName, lastName, address, mobile, email, pincode, 'Pending'], (err, result) => {
            if (err) {
                console.error('Error inserting checkout info:', err);
                return res.status(500).send('Error submitting checkout form');
            }
            res.redirect(`/shipping?orderId=${orderId}`);
        });  
    });
});

app.get('/shipping', (req, res) => {
    const token = req.cookies.token;
    // Verify token to decode user's email
    jwt.verify(token, 'vishal@123', (err, decoded) => {
        if (err) {
            console.error('Error verifying JWT token:', err);
            return res.status(401).send('Unauthorized');
        }

        // Extract user's email from decoded token
        const userEmail = decoded.email;

        const addressQuery = `SELECT * FROM checkout_info WHERE order_id = (SELECT order_id FROM shiping WHERE user_email = ? LIMIT 1)`;
        const orderQuery = `SELECT * FROM shiping WHERE user_email = ?`;
        const statusQuery = `SELECT status FROM checkout_info WHERE order_id = (SELECT order_id FROM shiping WHERE user_email = ? LIMIT 1)`;

        con.query(addressQuery, [userEmail], (err, addressResult) => {
            if (err) {
                console.error('Error fetching address information:', err);
                return res.status(500).send('Error fetching address information');
            }

            if (!addressResult.length) {
                // No orders found
                return res.render('shipping', {
                    addressData: null,
                    cartData: {
                        shipping: []
                    },
                    totalAmount: 0
                });
            }

            const orderId = addressResult[0].order_id;

            con.query(statusQuery, [userEmail], (err, statusResult) => {
                if (err) {
                    console.error('Error fetching order status:', err);
                    return res.status(500).send('Error fetching order status');
                }

                if (statusResult[0].status === 'Cancelled') {
                    // Order is cancelled
                    return res.render('shipping', {
                        addressData: null,
                        cartData: {
                            shipping: []
                        },
                        totalAmount: 0
                    });
                }

                con.query(orderQuery, [userEmail], (err, orderResult) => {
                    if (err) {
                        console.error('Error fetching order information:', err);
                        return res.status(500).send('Error fetching order information');
                    }

                    const totalAmount = orderResult.reduce((acc, item) => acc + item.price * item.quantity, 0);

                    res.render('shipping', {
                        addressData: addressResult[0],
                        cartData: {
                            shipping: orderResult
                        },
                        totalAmount: totalAmount
                    });
                });
            });
        });
    });
});

app.post('/cancel_order', (req, res) => {
    const token = req.cookies.token;
    // Verify token to decode user's email
    jwt.verify(token, 'vishal@123', (err, decoded) => {
        if (err) {
            console.error('Error verifying JWT token:', err);
            return res.status(401).send('Unauthorized');
        }

        // Extract user's email from decoded token
        const userEmail = decoded.email;

        const orderId = req.body.orderId;
        const cancelQuery = `UPDATE checkout_info SET status = 'Cancelled' WHERE order_id = ?`;

        con.query(cancelQuery, [orderId], (err, result) => {
            if (err) {
                console.error('Error cancelling order:', err);
                return res.status(500).send('Error cancelling order');
            }

            const deleteQuery = `DELETE FROM shiping WHERE order_id = ?`;

            con.query(deleteQuery, [orderId], (err, result) => {
                if (err) {
                    console.error('Error deleting order from shiping table:', err);
                    return res.status(500).send('Error deleting order from shiping table');
                }
                res.redirect('/home');
            });
        });
    });
});




app.get('/', (req, res) => {
    res.render('login');
});


app.get('/sign-up', (req, res) => {
    res.render('register');
});

app.get('/logout', (req, res) => {
    // Clear the token cookie
    res.clearCookie('token');
    // Redirect to the login page or any other page you want
    res.redirect('/');
});



app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});
