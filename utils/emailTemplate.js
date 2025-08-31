const emailTemplate = (content) => {
    return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>Email</title>
        <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f4f4f4; }
        .container { max-width: 660px; margin: 20px auto; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
        .header { padding: 20px;  background: #b6ebe0; }
        .header img { max-height: 50px; }
        .body { padding: 20px; font-size: 16px; color: #333; }
        .footer { background: #f1f1f1; padding: 15px; text-align: center; font-size: 12px; color: #777; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="https://ratepro-sa.com/assets/img/RATEPRO_-BupZjzpX.png" alt="Company Logo" />
          </div>
          <div class="body">
            ${content}
          </div>
          <div class="footer">
            © ${new Date().getFullYear()} RatePro. All rights reserved.
          </div>
        </div>
      </body>
    </html>
    `;
  };
  
  module.exports = emailTemplate;  