import dotenv from "dotenv";
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";

dotenv.config();

import User from "./schema/User";
import { FRONTEND_URL } from "./global";

const GMAIL_ADDRESS = process.env.GMAIL_ADDRESS;
const GMAIL_PASSWORD = process.env.GMAIL_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;

const router = express.Router();

if (GMAIL_ADDRESS && GMAIL_PASSWORD) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_ADDRESS,
      pass: GMAIL_PASSWORD,
    },
  });

  const sendEmail = (
    to: string,
    subject: string,
    text: string,
    html: string
  ) => {
    const data = {
      from: GMAIL_ADDRESS,
      to,
      subject,
      text,
      html,
    };

    return transporter.sendMail(data);
  };

  router.post("/register", async (req, res) => {
    const { email, password, name } = req.body;

    try {
      let user = await User.findOne({ email });
      if (user) return res.status(400).json({ message: "User already exists" });

      const verificationToken = crypto.randomBytes(20).toString("hex");
      user = new User({
        email,
        password,
        name,
        verificationToken,
      });

      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);

      await user.save();

      const verificationUrl = `${FRONTEND_URL}/verify-email?token=${verificationToken}`;
      const text = `Please verify your email by clicking on the following link: ${verificationUrl}`;
      const html = `<p>Please verify your email by clicking on the following link: <a href="${verificationUrl}">${verificationUrl}</a></p>`;

      await sendEmail(email, "Verify Email", text, html);

      res.json({
        message:
          "User registered successfully, Check your email for verfication link",
      });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Server Error" });
    }
  });

  router.get("/verify-email", async (req, res) => {
    const { token } = req.query;

    try {
      const user = await User.findOne({ verificationToken: token as string });

      if (!user) return res.status(400).json({ message: "Invalid Token" });

      user.isVerified = true;
      user.verificationToken = undefined;

      await user.save();

      res.json({ message: "Email verified successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server Error" });
    }
  });

  router.post("/forgot-password", async (req, res) => {
    const { email } = req.body;

    try {
      let user = await User.findOne({ email });

      if (!user) return res.status(400).json({ message: "User not found" });

      const resetToken = crypto.randomBytes(20).toString("hex");
      user.resetPasswordToken = resetToken;
      user.resetPasswordExpires = new Date(Date.now() + 3600000);

      await user.save();

      const resetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}`;
      const text = `You requested a password reset. Please click on the following link: ${resetUrl}`;
      const html = `<p>You requested a password reset. Please click on the following link: <a href="${resetUrl}">${resetUrl}</a></p>`;

      await sendEmail(email, "Reset Password", text, html);

      res.json({ message: "Password reset link sent to your email" });
    } catch (err: any) {
      console.error(err.message);
      res.status(500).json({ message: "Server Error" });
    }
  });

  router.post("/reset-password", async (req, res) => {
    const { token, password } = req.body;

    try {
      let user = await User.findOne({
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: Date.now() },
      });

      if (!user)
        return res.status(400).json({ message: "Invalid or expired token" });

      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;

      await user.save();

      res.json({ message: "Password reset successful" });
    } catch (err: any) {
      console.error(err.message);
      res.status(500).json({ message: "Server Error" });
    }
  });

  router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    try {
      let user = await User.findOne({ email });
      if (!user) return res.status(400).json({ message: "Invalid E-mail" });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch)
        return res.status(400).json({ message: "Invalid Password" });

      if (!user.isVerified)
        return res.status(400).json({ message: "Email not verified" });

      const payload = {
        user: {
          id: user.id,
        },
      };

      jwt.sign(
        payload,
        JWT_SECRET as string,
        { expiresIn: 360000 },
        (err, token) => {
          if (err) throw err;
          res.cookie("token", token, { httpOnly: true });
          res.json({ token });
        }
      );
    } catch (err: any) {
      console.error(err.message);
      res.status(500).json({ message: "Server Error" });
    }
  });

  router.post("/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ message: "Logged out" });
  });

  router.get('/', (req, res) => {
    res.json({ message: "Welcome to the auth route" });
  });
}

module.exports = router;