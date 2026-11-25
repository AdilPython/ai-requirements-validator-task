# Уведомление о расходах по карте — REST API

## Оглавление
* [General parameters](#general-parameters)
* [Working logic](#working-logic)
* [Special rules](#special-rules)
* [Scheme](#scheme)
* [Request parameters (Inputs)](#request-parameters-inputs)
  * [Path-параметры](#path-параметры)
  * [Query-параметры](#query-параметры)
  * [Request body](#request-body)
* [Outputs (Response)](#outputs-response)
  * [Параметры ответа метода](#параметры-ответа-метода)
* [Statuses](#statuses)

---

## General parameters

| Параметр | Описание / Значение |
| :--- | :--- |
| **Description** | Сохранение порога. Функциональные требования · Чтение порога |
| **REST type** | `GET` |
| **Authorization** | Bearer, сессия владельца карты |
| **Controller** | AlertsController |
| **URL type** | Dev / Prod |
| **Request URL** | Dev: `/alerts/saveLimit`<br>Prod: `—` |
| **CURL** | `curl -G "$BASE/alerts/saveLimit" -H "Authorization: Bearer $TOKEN" --data 'cardId=demo-42&amount=50000&enabled=1'` |
| **Swagger** | `—` |
| **Gitlab project** | Учебный контур |
| **Framework** | Учебный контур |
| **Author** | Школа тестирования |
| **Developer** | Команда практикума |

---

## Working logic
**Логика работы метода:**

1. Проверить пользовательскую сессию.
2. Проверить принадлежность карты клиенту.
3. Проверить сумму и переключатель.
4. Заменить настройку и вернуть результат сохранения.
5. При отклонении суммы вернуть прежнее состояние и результат ERROR.

---

## Special rules

| # | Rule |
| :-: | :--- |
| 1 | Целое число тенге, обе границы включены. |
| 2 | Повторное сохранение заменяет действующую настройку. |
| 3 | Изменение порога сохраняет накопленные расходы. |

---

## Scheme
```text
Приложение → AlertsController → хранилище настроек → AlertsController → приложение.
```

---

## Request parameters (Inputs)

### Path-параметры
*Не используются.*

### Query-параметры

| Parameter | Format | Size | Mandatory | Logic | Description | DB field |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- |
| `cardId` | string | 1–64 | Да | Карта клиента | Идентификатор карты | `card_id` |
| `amount` | integer | 32 bit | Да | 1 000–1 000 000 | Порог в тенге | `limit_kzt` |
| `enabled` | integer | 1 знак | Да | 0 или 1 | Признак включения | `enabled` |

### Request body
* **Content-Type**: `application/json`
* *Не используется.*

---

## Outputs (Response)

В данном разделе описаны ответы метода:
* Если результат успешный — `200`, `201`.
* Если результат неуспешный — `400`, `401` и т.д.

### Параметры ответа метода

| Parameter | Format | Logic | Description | DB field |
| :--- | :--- | :--- | :--- | :--- |
| `result` | string | `OK` / `ERROR` | Исход сохранения | `—` |
| `amount` | string | При успехе | Порог в тенге | `limit_kzt` |
| `enabled` | string | `«0»` или `«1»` | Признак включения | `enabled` |
| `message` | string | При ошибке | Описание ошибки | `—` |

---

## Statuses

### `200 : Successful - Created`
Ответ в случае успешного выполнения метода:
```json
{"result":"OK","amount":"50000","enabled":"1"}
```
или
```json
{"result":"ERROR","message":"Проверьте сумму"}
```

### `400 : Unsuccessful - Bad request`
Ответ в случае, если параметры запроса заполнены неверно:
```json
{"message":"Некорректный запрос"}
```

### `401 : Unsuccessful - Unauthorized`
Ответ в случае если запрос выполнен без необходимой авторизации:
```json
{"message":"Требуется вход"}
```

### `403 : Unsuccessful - Forbidden`
Ответ в случае, если на указанный ресурс доступ запрещен:
> Для чужой карты возвращается 404, как и для отсутствующей карты. Ответ 404 — `{"message":"Карта не найдена"}`.

### `500 : Unsuccessful - Internal server error`
Ответ в случае, если произошла внутренняя ошибка сервера:
```json
{"message":"Ошибка сервиса"}
```
