import InventoryRecord from "../models/InventoryRecord.models.js";
import { isValidObjectId } from "mongoose";

const getInventoryRecords = (req, res) => {
  InventoryRecord.find()
    .populate("productName", { __v: 0 })
    .populate("category", { __v: 0 })
    .populate("typeInventory", { __v: 0 })
    .populate("User", { __v: 0, password: 0 })
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(501).json({
        message: "Hubo un error al cargar los registros de inventario!",
        error,
      }),
    );
};

const getInventoryRecord = (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id))
    return res.status(501).json({ message: "Hubo un error en la petición" });
  InventoryRecord.findById(id)
    .populate("category", { __v: 0 })
    .populate("typeInventory", { __v: 0 })
    .populate("productName", { __v: 0 })
    .populate("User", { __v: 0, password: 0 })
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(501).json({
        message: "Hubo un error el registro de inventario!",
        error,
      }),
    );
};
const createInventoryRecord = (req, res) => {
  const {
    date,
    typeInventory,
    productName,
    category,
    productPrice,
    quantity,
    totalAmount,
    Observations,
  } = req.body;

  const newInventoryRecord = new InventoryRecord({
    date,
    typeInventory,
    productName,
    category,
    productPrice,
    quantity,
    totalAmount,
    Observations,
  });
  newInventoryRecord
    .save()
    .then((data) => res.status(201).json(data))
    .catch((error) =>
      res.status(501).json({
        message: "Ha ocurrido un error al crear el registro de inventario !",
        error,
      }),
    );
};

const updateInventoryRecord = (req, res) => {
  const { id } = req.params;
  const {
    date,
    typeInventory,
    productName,
    category,
    productPrice,
    quantity,
    totalAmount,
    Observations,
  } = req.body;
  if (!isValidObjectId(id))
    return res.status(501).json({
      messsage: "Ha ocurrido un error en la peticion",
    });
  InventoryRecord.findOneAndUpdate(
    { _id: id },
    {
      date,
      typeInventory,
      productName,
      category,
      productPrice,
      quantity,
      totalAmount,
      Observations,
    },
    { new: true },
  )
    .then((data) => res.status(200).json(data))
    .catch((error) =>
      res.status(501).json({
        message:
          "Ha ocurrido un error al actualizar el registro de inventario !  ",
        error,
      }),
    );
};

const deleteInventoryRecord = (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id))
    return res.status(501).json({ message: "Hubo un error en la petición" });

  InventoryRecord.deleteOne({ _id: id })
    .then(() =>
      res.status(201).json({
        message: "El registro de inventario se ha borrado exitosamente!",
      }),
    )
    .catch((error) =>
      res.status(505).json({
        message: "Hubo un error al intentar borrar el registro de inventario  ",
        error,
      }),
    );
};

export {
  getInventoryRecord,
  getInventoryRecords,
  createInventoryRecord,
  updateInventoryRecord,
  deleteInventoryRecord,
};
