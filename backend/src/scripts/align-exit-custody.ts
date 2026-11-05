import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ns-foundation';

async function alignExitCustody() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db!;
  const custodyCol = db.collection('custodyaccounts');
  const movementsCol = db.collection('custodymovements');
  const exitsCol = db.collection('memberexitsettlements');

  // 1. Rename 'bKash Society Merchant/Agent' to 'Moin Uddin Personal bKash'
  const moinBkashId = new mongoose.Types.ObjectId('6abb8e12bec2a63bd3a92574');
  const samratBkashId = new mongoose.Types.ObjectId('6ac504fcfc1479e4fad081ee');

  const renameRes = await custodyCol.updateOne(
    { _id: moinBkashId },
    { $set: { name: 'Moin Uddin Personal bKash' } }
  );
  console.log('Renamed Moin bKash account:', renameRes.modifiedCount);

  // 2. Reassign Bayzid and Tanvir exit movements from Samrat to Moin
  const mov34Id = new mongoose.Types.ObjectId('6ae4b73e58ad3f524850ab34'); // Tanvir
  const mov39Id = new mongoose.Types.ObjectId('6ae4b73f58ad3f524850ab39'); // Bayzid

  const movUpdate = await movementsCol.updateMany(
    { _id: { $in: [mov34Id, mov39Id] } },
    { $set: { custodyAccountId: moinBkashId } }
  );
  console.log('Reassigned exit movements to Moin bKash:', movUpdate.modifiedCount);

  // 3. Recalculate cached balances for all custody accounts
  const allAccounts = await custodyCol.find({}).toArray();
  for (const acc of allAccounts) {
    const inMovs = await movementsCol.aggregate([
      { $match: { custodyAccountId: acc._id, movementType: 'IN' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).toArray();

    const outMovs = await movementsCol.aggregate([
      { $match: { custodyAccountId: acc._id, movementType: 'OUT' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).toArray();

    const totalIn = inMovs[0]?.total || 0;
    const totalOut = outMovs[0]?.total || 0;
    const newBalance = Math.round((totalIn - totalOut + Number.EPSILON) * 100) / 100;

    await custodyCol.updateOne(
      { _id: acc._id },
      { $set: { cachedBalance: newBalance } }
    );
    console.log(`Account ${acc.name} (${acc._id}): In=৳${totalIn}, Out=৳${totalOut}, Balance=৳${newBalance}`);
  }

  // 4. Verify exit settlements
  const allExits = await exitsCol.find({}).toArray();
  console.log('Exits in DB:', allExits.map((e) => ({
    id: e._id,
    deductionRate: e.deductionRate,
    netAmount: e.netAmount,
    documentName: e.documentName,
    receiptUrl: e.receiptUrl,
  })));

  await mongoose.disconnect();
  console.log('Done!');
}

alignExitCustody().catch((err) => {
  console.error(err);
  process.exit(1);
});
