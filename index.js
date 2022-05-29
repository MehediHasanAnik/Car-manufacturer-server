const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

// mini
// ieH2V9BQjHoLEcd4

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mlx3w.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  try {
    if (!authHeader) {
      return res.status(401).send({ message: "UnAuthorized access" });
    }
    const token = authHeader.split(" ")[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
      if (err) {
        return res.status(403).send({ message: "Forbidden access" });
      }
      req.decoded = decoded;
      next();
    });
  } catch (error) { }
}

async function run() {
  try {
    await client.connect();
    const serviceCollecton = client.db("partShop").collection("services");
    const userCollection = client.db("partShop").collection("users");
    const paymentCollection = client.db("partShop").collection("payments");
    const orderCollection = client.db("partShop").collection("orders");
    const reviewCollection = client.db("partShop").collection("reviews");

    // verify admin
    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    };

    // check admin
    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    // token create
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "1h" }
      );
      res.send({ result, token });
    });

    // profile-update
    app.put("/profile-update/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const options = { upsert: true };
      const updatedDoc = {
        $set: req.body,
      };
      const updateOrder = await userCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send({ success: true, updateOrder });
    });

    // create-payment-intent
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      try {
        const service = req.body;
        const price = parseInt(service.price);
        const min_order = parseInt(service.min_order);
        const amount = min_order * price * 100;
        console.log(amount);
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (error) { }
    });
    // admin manage product get api
    app.get("/admin-product", verifyJWT, verifyAdmin, async (req, res) => {
      const query = {};
      const cursor = serviceCollecton.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });



    // get api
    app.get("/equipments", async (req, res) => {
      const query = {};
      const cursor = serviceCollecton.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/reviews", async (req, res) => {
      const query = {};
      const cursor = reviewCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });



    app.get('/user', verifyJWT, verifyAdmin, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users)
    })




    // post
    app.get("/equipments/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const inventory = await serviceCollecton.findOne(query);
      res.send(inventory);
    });

    // order post api
    app.post("/order", async (req, res) => {
      const data = {
        productId: req.body.productId,
        email: req.body.email,
        user_name: req.body.user_name,
        productName: req.body.productName,
        price: req.body.price,
        min_order: req.body.min_order,
        diliverd: "pending",
        address: req.body.address,
        phone: req.body.phone,
      };
      console.log(data);
      const result = await orderCollection.insertOne(data);
      res.send({ success: true, result });
    });


    // add post api
    app.post("/add-post", async (req, res) => {
      console.log(req.body);
      const result = await serviceCollecton.insertOne(req.body);
      res.send(result);
    });



    // user order
    app.get("/order/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const decodedEmail = req.decoded.email;
      if (email === decodedEmail) {
        const query = { email: email };
        const result = await orderCollection.find(query).toArray();
        return res.send(result);
      } else {
        return res.status(403).send({ message: "forbidden access" });
      }
    });

    // order by id
    app.get("/order-payment/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: ObjectId(id) };
      const result = await orderCollection.findOne(query);
      res.send(result);
    });

    // order patch by id
    app.patch("/order/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };

      const result = await paymentCollection.insertOne(payment);
      const updateOrder = await orderCollection.updateOne(filter, updatedDoc);
      res.send(updateOrder);
    });




    // order order-shipped
    app.put("/order-shipped/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          diliverd: "shipped",
        },
      };
      const updateOrder = await orderCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(updateOrder);
    });

    app.put("/user/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const updatedDoc = {
        $set: { role: 'admin' },
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });


    // order delete
    app.delete("/orderdelete/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = { _id: ObjectId(id) };
      const result = await orderCollection.deleteOne(filter);
      res.send(result);
    });
    app.delete("/userDelete/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = { _id: ObjectId(id) };
      const result = await userCollection.deleteOne(filter);
      res.send(result);
    });

    app.delete("/productdelete/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = { _id: ObjectId(id) };
      const result = await serviceCollecton.deleteOne(filter);
      res.send(result);
    });

    // order post api
    app.post("/review", async (req, res) => {
      const result = await reviewCollection.insertOne(req.body);
      res.send({ success: true, result });
    });

    // admin api
    app.get("/admin-order/", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await orderCollection.find({}).toArray();
      return res.send(result);
    });
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello anik!");
});

app.listen(port, () => {
  console.log(`My Example app listening on port ${port}`);
});
