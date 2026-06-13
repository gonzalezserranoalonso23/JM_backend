import mongoose from "mongoose";

const InventoryRecordSchema = new mongoose.Schema({
  date: {
    type: String,
    required: [true, "Proporcionar un fecha"],
  },
  typeInventory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TypeInventory",
    required: [true, "Proporcionar un tipo de inventario"],
  },
  productName: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: [true, "Proporcionar un nombre de producto"],
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    required: [true, "Proporcionar un nombre de categoría"],
  },
  productPrice: {
    type: String,
    required: [true, "Proporcionar un nombre de contacto"],
  },
  quantity: {
    type: Number,
    required: [true, "Proporcionar un cantidad"],
  },
  totalAmount: {
    type: Number,
    required: [true, "Proporcionar un monto"],
  },
  Observations: {
    type: String,
    default: null,
  },
  User: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "Proporcionar un usuario"],
  },
});

export default mongoose.model("InventoryRecord", InventoryRecordSchema);
