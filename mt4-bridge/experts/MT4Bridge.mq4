//+------------------------------------------------------------------+
//|                                                    MT4Bridge.mq4 |
//|                                      MetaTrader 4 ZeroMQ Bridge |
//|                                    Provides REST API via ZeroMQ |
//+------------------------------------------------------------------+
#property copyright "MT4 Bridge"
#property link      ""
#property version   "1.00"
#property strict

// Include ZeroMQ library
#include <Zmq/Zmq.mqh>

// Global variables
Context context;
Socket socket(context, ZMQ_REP);
string zmqEndpoint = "tcp://*:5555";
int magicNumber = 999999;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("MT4Bridge EA initializing...");

   // Bind ZMQ socket
   if (!socket.bind(zmqEndpoint))
   {
      Print("ERROR: Failed to bind ZMQ socket to ", zmqEndpoint);
      return(INIT_FAILED);
   }

   Print("ZMQ socket bound to ", zmqEndpoint);
   Print("MT4Bridge EA initialized successfully");

   // Set chart properties
   Comment("MT4Bridge Active\n",
           "ZMQ Endpoint: ", zmqEndpoint, "\n",
           "Waiting for requests...");

   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   Print("MT4Bridge EA shutting down...");
   socket.unbind(zmqEndpoint);
   socket.disconnect(zmqEndpoint);
   Comment("");
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   // Check for incoming ZMQ messages (non-blocking)
   ZmqMsg request;

   if (socket.recv(request, true))  // Non-blocking receive
   {
      string requestData = request.getData();
      Print("Received request: ", requestData);

      // Parse and process request
      string response = ProcessRequest(requestData);

      // Send response
      ZmqMsg reply(response);
      socket.send(reply);

      Print("Sent response: ", response);
   }
}

//+------------------------------------------------------------------+
//| Process incoming request                                         |
//+------------------------------------------------------------------+
string ProcessRequest(string requestJson)
{
   // Parse JSON request
   int id = 0;
   string command = "";

   // Simple JSON parsing (for production, use proper JSON library)
   if (StringFind(requestJson, "\"command\"") >= 0)
   {
      int cmdStart = StringFind(requestJson, "\"command\":\"") + 11;
      int cmdEnd = StringFind(requestJson, "\"", cmdStart);
      command = StringSubstr(requestJson, cmdStart, cmdEnd - cmdStart);
   }

   Print("Processing command: ", command);

   // Route command to handler
   string result = "";

   if (command == "GET_ACCOUNT_INFO")
      result = GetAccountInfo();
   else if (command == "GET_SYMBOLS")
      result = GetSymbols();
   else if (command == "GET_PRICE")
      result = GetPrice(requestJson);
   else if (command == "GET_OPEN_ORDERS")
      result = GetOpenOrders();
   else if (command == "GET_ORDER")
      result = GetOrder(requestJson);
   else if (command == "CREATE_ORDER")
      result = CreateOrder(requestJson);
   else if (command == "CLOSE_ORDER")
      result = CloseOrder(requestJson);
   else if (command == "CLOSE_ALL_ORDERS")
      result = CloseAllOrders(requestJson);
   else if (command == "MODIFY_ORDER")
      result = ModifyOrder(requestJson);
   else
      result = ErrorResponse("Unknown command: " + command);

   return result;
}

//+------------------------------------------------------------------+
//| Get account information                                          |
//+------------------------------------------------------------------+
string GetAccountInfo()
{
   double balance = AccountBalance();
   double equity = AccountEquity();
   double margin = AccountMargin();
   double freeMargin = AccountFreeMargin();
   double profit = AccountProfit();

   string json = StringFormat(
      "{\"error\":null,\"data\":{\"balance\":%.2f,\"equity\":%.2f,\"margin\":%.2f,\"freeMargin\":%.2f,\"profit\":%.2f,\"currency\":\"%s\",\"leverage\":%d}}",
      balance, equity, margin, freeMargin, profit,
      AccountCurrency(), AccountLeverage()
   );

   return json;
}

//+------------------------------------------------------------------+
//| Get available symbols                                            |
//+------------------------------------------------------------------+
string GetSymbols()
{
   string symbols = "";
   int total = SymbolsTotal(true);

   for (int i = 0; i < total; i++)
   {
      string symbol = SymbolName(i, true);
      if (i > 0) symbols += ",";
      symbols += "\"" + symbol + "\"";
   }

   string json = "{\"error\":null,\"data\":{\"symbols\":[" + symbols + "]}}";
   return json;
}

//+------------------------------------------------------------------+
//| Get price for symbol                                            |
//+------------------------------------------------------------------+
string GetPrice(string requestJson)
{
   string symbol = ExtractStringParam(requestJson, "symbol");

   if (symbol == "")
   {
      return ErrorResponse("Missing symbol parameter");
   }

   double bid = MarketInfo(symbol, MODE_BID);
   double ask = MarketInfo(symbol, MODE_ASK);

   if (bid == 0 || ask == 0)
   {
      return ErrorResponse("Invalid symbol or no price available");
   }

   string json = StringFormat(
      "{\"error\":null,\"data\":{\"symbol\":\"%s\",\"bid\":%.5f,\"ask\":%.5f,\"spread\":%.5f}}",
      symbol, bid, ask, ask - bid
   );

   return json;
}

//+------------------------------------------------------------------+
//| Get open orders                                                  |
//+------------------------------------------------------------------+
string GetOpenOrders()
{
   string orders = "";
   int count = 0;

   for (int i = 0; i < OrdersTotal(); i++)
   {
      if (OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
      {
         if (count > 0) orders += ",";
         orders += OrderToJson();
         count++;
      }
   }

   string json = "{\"error\":null,\"data\":{\"orders\":[" + orders + "]}}";
   return json;
}

//+------------------------------------------------------------------+
//| Get specific order                                               |
//+------------------------------------------------------------------+
string GetOrder(string requestJson)
{
   int ticket = (int)ExtractNumberParam(requestJson, "ticket");

   if (ticket <= 0)
   {
      return ErrorResponse("Invalid ticket number");
   }

   if (!OrderSelect(ticket, SELECT_BY_TICKET))
   {
      return ErrorResponse("Order not found");
   }

   string json = "{\"error\":null,\"data\":" + OrderToJson() + "}";
   return json;
}

//+------------------------------------------------------------------+
//| Create market order                                              |
//+------------------------------------------------------------------+
string CreateOrder(string requestJson)
{
   string symbol = ExtractStringParam(requestJson, "symbol");
   string side = ExtractStringParam(requestJson, "side");
   double volume = ExtractNumberParam(requestJson, "volume");
   double stopLoss = ExtractNumberParam(requestJson, "stopLoss");
   double takeProfit = ExtractNumberParam(requestJson, "takeProfit");
   string comment = ExtractStringParam(requestJson, "comment");

   if (symbol == "" || side == "" || volume <= 0)
   {
      return ErrorResponse("Missing required parameters");
   }

   int orderType = (side == "BUY") ? OP_BUY : OP_SELL;
   double price = (orderType == OP_BUY) ? MarketInfo(symbol, MODE_ASK) : MarketInfo(symbol, MODE_BID);

   int ticket = OrderSend(
      symbol,
      orderType,
      volume,
      price,
      3,          // Slippage
      stopLoss,
      takeProfit,
      comment,
      magicNumber,
      0,
      (orderType == OP_BUY) ? clrBlue : clrRed
   );

   if (ticket < 0)
   {
      return ErrorResponse("Order failed: " + IntegerToString(GetLastError()));
   }

   if (OrderSelect(ticket, SELECT_BY_TICKET))
   {
      string json = "{\"error\":null,\"data\":" + OrderToJson() + "}";
      return json;
   }

   return ErrorResponse("Order created but could not retrieve details");
}

//+------------------------------------------------------------------+
//| Close order                                                      |
//+------------------------------------------------------------------+
string CloseOrder(string requestJson)
{
   int ticket = (int)ExtractNumberParam(requestJson, "ticket");

   if (ticket <= 0)
   {
      return ErrorResponse("Invalid ticket number");
   }

   if (!OrderSelect(ticket, SELECT_BY_TICKET))
   {
      return ErrorResponse("Order not found");
   }

   if (OrderClose(OrderTicket(), OrderLots(), OrderClosePrice(), 3, clrGray))
   {
      string json = StringFormat("{\"error\":null,\"data\":{\"success\":true,\"ticket\":%d}}", ticket);
      return json;
   }

   return ErrorResponse("Failed to close order: " + IntegerToString(GetLastError()));
}

//+------------------------------------------------------------------+
//| Close all orders                                                 |
//+------------------------------------------------------------------+
string CloseAllOrders(string requestJson)
{
   string filterSymbol = ExtractStringParam(requestJson, "symbol");
   int closedCount = 0;

   for (int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if (OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
      {
         if (filterSymbol != "" && OrderSymbol() != filterSymbol)
            continue;

         if (OrderClose(OrderTicket(), OrderLots(), OrderClosePrice(), 3, clrGray))
         {
            closedCount++;
         }
      }
   }

   string json = StringFormat("{\"error\":null,\"data\":{\"closedCount\":%d}}", closedCount);
   return json;
}

//+------------------------------------------------------------------+
//| Modify order                                                     |
//+------------------------------------------------------------------+
string ModifyOrder(string requestJson)
{
   int ticket = (int)ExtractNumberParam(requestJson, "ticket");
   double stopLoss = ExtractNumberParam(requestJson, "stopLoss");
   double takeProfit = ExtractNumberParam(requestJson, "takeProfit");

   if (ticket <= 0)
   {
      return ErrorResponse("Invalid ticket number");
   }

   if (!OrderSelect(ticket, SELECT_BY_TICKET))
   {
      return ErrorResponse("Order not found");
   }

   if (OrderModify(ticket, OrderOpenPrice(), stopLoss, takeProfit, 0, clrYellow))
   {
      string json = "{\"error\":null,\"data\":" + OrderToJson() + "}";
      return json;
   }

   return ErrorResponse("Failed to modify order: " + IntegerToString(GetLastError()));
}

//+------------------------------------------------------------------+
//| Convert order to JSON                                            |
//+------------------------------------------------------------------+
string OrderToJson()
{
   string openTimeStr = TimeToString(OrderOpenTime(), TIME_DATE|TIME_MINUTES);

   // Escape all string fields to prevent JSON parsing errors
   string escapedSymbol = EscapeJsonString(OrderSymbol());
   string escapedComment = EscapeJsonString(OrderComment());
   string escapedOpenTime = EscapeJsonString(openTimeStr);

   string json = StringFormat(
      "{\"ticket\":%d,\"symbol\":\"%s\",\"type\":\"%s\",\"lots\":%.2f,\"openPrice\":%.5f,\"stopLoss\":%.5f,\"takeProfit\":%.5f,\"openTime\":\"%s\",\"profit\":%.2f,\"comment\":\"%s\"}",
      OrderTicket(),
      escapedSymbol,
      OrderTypeToString(OrderType()),
      OrderLots(),
      OrderOpenPrice(),
      OrderStopLoss(),
      OrderTakeProfit(),
      escapedOpenTime,
      OrderProfit(),
      escapedComment
   );

   return json;
}

//+------------------------------------------------------------------+
//| Convert order type to string                                     |
//+------------------------------------------------------------------+
string OrderTypeToString(int type)
{
   switch(type)
   {
      case OP_BUY: return "BUY";
      case OP_SELL: return "SELL";
      case OP_BUYLIMIT: return "BUY_LIMIT";
      case OP_SELLLIMIT: return "SELL_LIMIT";
      case OP_BUYSTOP: return "BUY_STOP";
      case OP_SELLSTOP: return "SELL_STOP";
      default: return "UNKNOWN";
   }
}

//+------------------------------------------------------------------+
//| Helper: Extract string parameter from JSON                       |
//+------------------------------------------------------------------+
string ExtractStringParam(string json, string key)
{
   string searchKey = "\"" + key + "\":\"";
   int start = StringFind(json, searchKey);
   if (start < 0) return "";

   start += StringLen(searchKey);
   int end = StringFind(json, "\"", start);
   if (end < 0) return "";

   return StringSubstr(json, start, end - start);
}

//+------------------------------------------------------------------+
//| Helper: Extract number parameter from JSON                       |
//+------------------------------------------------------------------+
double ExtractNumberParam(string json, string key)
{
   string searchKey = "\"" + key + "\":";
   int start = StringFind(json, searchKey);
   if (start < 0) return 0;

   start += StringLen(searchKey);

   // Find end of number (comma, brace, or end of string)
   string remaining = StringSubstr(json, start);
   int end = 0;
   for (int i = 0; i < StringLen(remaining); i++)
   {
      string ch = StringSubstr(remaining, i, 1);
      if (ch == "," || ch == "}" || ch == "]")
      {
         end = i;
         break;
      }
   }

   if (end == 0) end = StringLen(remaining);
   string numStr = StringSubstr(remaining, 0, end);

   // Remove quotes if present
   StringReplace(numStr, "\"", "");
   StringReplace(numStr, " ", "");

   if (numStr == "null" || numStr == "") return 0;

   return StringToDouble(numStr);
}

//+------------------------------------------------------------------+
//| Helper: Escape JSON string                                       |
//+------------------------------------------------------------------+
string EscapeJsonString(string str)
{
   string result = str;

   // Escape backslash first (must be first!)
   StringReplace(result, "\\", "\\\\");

   // Escape double quotes
   StringReplace(result, "\"", "\\\"");

   // Escape newlines
   StringReplace(result, "\n", "\\n");
   StringReplace(result, "\r", "\\r");

   // Escape tabs
   StringReplace(result, "\t", "\\t");

   return result;
}

//+------------------------------------------------------------------+
//| Helper: Create error response                                    |
//+------------------------------------------------------------------+
string ErrorResponse(string errorMsg)
{
   string escapedMsg = EscapeJsonString(errorMsg);
   string json = "{\"error\":\"" + escapedMsg + "\",\"data\":null}";
   return json;
}
