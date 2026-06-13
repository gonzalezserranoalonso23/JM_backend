import mongoose from "mongoose";

const PaymentTypeSchema = new mongoose.Schema({
  paymentType: {
    type: String,
    required: [true, "Proporcionar un nombre de tipo de pago"],
  },
});

export default mongoose.model("PaymentType", PaymentTypeSchema);
