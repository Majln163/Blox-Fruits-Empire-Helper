const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites
  ]
});

// ذخيرة invites
const invites = new Map();
const inviteCounts = new Map();

client.once('ready', async () => {
  console.log(✅ Logged in as ${client.user.tag});

  for (const guild of client.guilds.cache.values()) {
    try {
      const guildInvites = await guild.invites.fetch();
      invites.set(guild.id, guildInvites);
    } catch (err) {
      console.log("Invite fetch failed:", err.message);
    }
  }
});

// update invites cache
client.on('inviteCreate', async invite => {
  const guildInvites = await invite.guild.invites.fetch();
  invites.set(invite.guild.id, guildInvites);
});

// user joins
client.on('guildMemberAdd', async (member) => {
  try {
    const guild = member.guild;

    const oldInvites = invites.get(guild.id);
    const newInvites = await guild.invites.fetch();
    invites.set(guild.id, newInvites);

    const usedInvite = newInvites.find(inv =>
      oldInvites?.get(inv.code)?.uses < inv.uses
    );

    const inviter = usedInvite?.inviter  null;

    // count invites
    if (inviter) {
      inviteCounts.set(inviter.id, (inviteCounts.get(inviter.id) 
 0) + 1);
    }

    const inviterCount = inviter ? inviteCounts.get(inviter.id) : 0;

    // 🎨 CREATE IMAGE
    const canvas = createCanvas(900, 300);
    const ctx = canvas.getContext('2d');

    // Background (WORKING neon style)
    const background = await loadImage('https://i.imgur.com/zY6F6cG.png');
    ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
Imgur
Imgur
Imgur: The magic of the Internet
Imgur
// Dark overlay box
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(180, 50, 650, 200);

    // Avatar
    const avatar = await loadImage(member.user.displayAvatarURL({ extension: 'png' }));
    ctx.save();
    ctx.beginPath();
    ctx.arc(100, 150, 70, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 30, 80, 140, 140);
    ctx.restore();

    // Text styling
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 30px sans-serif";
    ctx.fillText(Welcome ${member.user.username}, 200, 110);

    ctx.font = "20px sans-serif";
    ctx.fillText(Invited by: ${inviter ? inviter.tag : "Unknown"}, 200, 150);
    ctx.fillText(Inviter invites: ${inviterCount}, 200, 180);
    ctx.fillText(Member #${guild.memberCount}, 200, 210);

    // Send image
    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'welcome.png' });

    const channel = guild.channels.cache.find(c => c.name === "welcome");
    if (!channel) return;

    await channel.send({ files: [attachment] });

  } catch (err) {
    console.log("❌ Join event error:", err);
  }
});

client.login("MTUwMDU1NzQ2MDI3NTIwNDIwNg.GEikwz.85a_Osp-Gik9ZEMZ92HwkkTiKvpOimhCi7n0eI");
