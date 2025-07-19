# 📬 Newsletter Reader

This project is a mobile application designed to turn an email inbox full of newsletters into a clean, readable, and notification-driven news feed.

## The Goal

The core idea is to:
1.  Automatically watch an email account (initially targeting Gmail) for new emails from specific senders (newsletters).
2.  Parse these emails to extract the sender, subject, and body content.
3.  Store them in a central database.
4.  Send a real-time push notification to a mobile app.
5.  Present the newsletters in a simple, article-style format within the app.

## Tech Stack

*   **Backend**: Node.js with Express
*   **Database**: SQLite (initially, can be swapped for PostgreSQL)
*   **Mobile App**: React Native
*   **Push Notifications**: Firebase Cloud Messaging (FCM)

## Project Status

For a detailed, step-by-step plan and to see the current progress, please refer to the [**Implementation Roadmap**](IMPLEMENTATION_ROADMAP.md). 