const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const app = express();
const port = 5000;
const puppeteer = require('puppeteer');
const {JSDOM} = require('jsdom');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.json());

const share_db = mysql.createConnection({
    host: 'localhost',
    port: '3306',
    user: 'root',
    password: '0000',
    database: 'mocom'
});

share_db.connect((err => {
    if (err) {
        console.log(err);
        return;
    }
    console.log("DB Connected");
}));

// TODO
// 기존의 데이터와 비교해서 없는 과제일 경우에만 추가.

/*

/api/login : 이러닝에 있는 과제를 크롤링

Input 
{
    id: user_id,
    pw: user_password
}

Output
{
    "과목 이름" : [
        {
            "title" : "과제명",
            "date" : "마감일"
        }, {
            "title" : "과제명",
            "date" : "마감일"
        } ...
    ],
    "과목 이름" : [
        {
            "title" : "과제명",
            "date" : "마감일"
        }, {
            "title" : "과제명",
            "date" : "마감일"
        } ...
    ] ...
}

*/

/*

/api/check
목적 : 존재하는 share_number인지 확인

INPUT : 
{
    "share_number" : 확인 할 숫자
}

OUTPUT : 
true or false

/api/share

GET : 서버에 저장된 정보를 가져오기 위함
INPUT : 
{
    "share_number" : 가져올 정보의 숫자
}
OUTPUT : 
{
    title: 제목,
    ddate: 마감일,
    tesk: 세부 할일,
    share_number: 숫자
}

POST : 서버에 저장하기 위함
INPUT : 
{
    "title" : 제목,
    "ddate" : 마감일,
    "tesk" : 세부 할일,
    "share_number" : 숫자
}
OUTPUT :
true or false

*/
app.post('/api/login', async (req, res) => {
    console.log(req.query);
    const loginData = req.query;

    try {
        var assignmentData = {}; // 최종에 반환할 JSON

        // 로그인 파트
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.goto("https://eclass.hanbat.ac.kr");
        await page.goto("https://eclass.hanbat.ac.kr/xn-sso/login.php?auto_login=&sso_only=&cvs_lgn=&site=&return_url=https%3A%2F%2Feclass.hanbat.ac.kr%2Fxn-sso%2Fgw-cb.php%3Ffrom%3D%26site%3D%26login_type%3Dstandalone%26return_url%3D");
        await page.type('form[name="form1"] input[name="login_user_id"]', loginData.id); // id 폼
        await page.type('form[name="form1"] input[name="login_user_password"]', loginData.pw); // pw 폼
        await page.evaluate(() => {
            OnLogon(); // 로그인 함수 실행
        });
        await page.waitForNavigation(); // 로그인 기다림

        await page.goto('https://lms.hanbat.ac.kr'); // lms로 이동
        const content = await page.content(); // html 불러오기
        const dom = new JSDOM(content);
        const document = dom.window.document;
        var data = document.getElementsByTagName('script'); // 과목에 해당하는 요소 불러오기

        var preCoursesData = data[3].textContent.split('STUDENT_PLANNER_ENABLED":true,');
        var precoursesData1 = preCoursesData[1].split(',"STUDENT_PLANNER')[0].replace(/:\s*([a-zA-Z0-9_]+)/g, ': "$1"');
        const CoursesData = "{" + precoursesData1.replace(/\bnull\b/g, "x") + "}";
        const coursesJson = JSON.parse(CoursesData);
        var assignmentsLink = []
        coursesJson.STUDENT_PLANNER_COURSES.forEach(dat=> {
            if (!dat.shortName.startsWith("[") && !dat.shortName.startsWith("장애") && !dat.shortName.startsWith("폭력")) {
                assignmentsLink.push(dat.href + "/assignments");
            }
                
        })
        // 과제 추출 파트
        for (var i = 0; i < assignmentsLink.length; i++) {
            await page.goto('https://lms.hanbat.ac.kr' + assignmentsLink[i]); // 위에서 추출한 과목 과제 링크 접속
            
            console.log(assignmentsLink[i])

            const content = await page.content(); // html 불러오기
            await new Promise(resolve => setTimeout(resolve, 4000)); // 페이지 로딩을 위한 4초 대기
            const dom = new JSDOM(content); // DOM으로 HTML 분석
            const document = dom.window.document; // document 생성

            var title = document.getElementsByClassName("ellipsible"); // 과목명 HTML raw data
            var titles = Array.from(title)[1].textContent; // 과목명
            var data = document.getElementsByClassName("ig-title"); // 과제 정보 HTML raw data
            var date = document.getElementsByClassName("ig-details"); // 과제 마감일 HTML raw data
            var tmp = [];

            // /courses/숫자 사이트의 헤더 script 부분을 통해 과제 파악 해야함
            var assignData = document.getElementsByTagName("script");
            const assignJson = JSON.parse(assignData[3].textContent.split("ENV = ")[1].replace(";", ""));
            if (assignJson.notices.length == 0) {
                console.log(titles);
                for (let j = 0; j < data.length; j++) {
                    var title = data[j].textContent; // 과제명 추출
                    title = title.trim(); // 공백 제거
                    var dates = date[j].getElementsByTagName("span"); // 날짜 추출
                    if (dates.length == 4) { // 마감일을 설정하지 않았을 경우 span의 개수가 4개
                        dates = "기한 없음";
                    } else if (dates.length == 5 || dates.length == 6) { // 닫힘이 설정되지 않았으나, 마감되었을 때
                        dates = dates[0].textContent.trim();
                        if (dates != "기한 없음") {
                            var newDate = dates.split("월 ");
                            var preMonth = newDate[0];
                            if (newDate.length == 1) {
                                dates = "NULL"
                            } else {
                                var preDay = newDate[1].split("일")[0];
                                dates = preMonth + "/" + preDay;
                            }
                        }
                    } else { // 닫힘, 마감 둘 다 설정됨
                        dates = dates[3].textContent.trim();
                        if (dates != "기한 없음") {
                            var newDate = dates.split("월 ");
                            var preMonth = newDate[0];
                            if (newDate.length == 1) {
                                dates = "NULL"
                            } else {
                                var preDay = newDate[1].split("일")[0];
                                dates = preMonth + "/" + preDay;
                            }
                        }
                    }
                    tmp.push({"title" : title, "date" : dates});
                }
            }
            // if (assignJson.notices.length == 0 && tmp.length == 0) {
            //     console.log(titles, Array.from(data));
            //     i--;
            //     continue;
            // }
            if (tmp.length != 0)
                assignmentData[titles] = tmp;
        }

        
    }
    catch (error) {
        console.log(error);
    }
    res.status(200).send(assignmentData);

});


// DB에 해당 번호가 있는지 확인하는 함수
app.get("/api/check", (req, res) => {
    console.log("get api check");
    const id = req.query.share_number;
    console.log(id);
    const query = `select EXISTS (select * from share_db where share_number=${id} limit 1) as success;`
    share_db.query(query, (err, result) => {
        if (err) {
            console.log(err);
        }
        if (result[0].success == 0) {
            res.send(true).status(200);
        } else {
            res.send(false).status(200);
        }
    });
});

app.get("/api/share", async (req, res) => {
    const id = req.query.share_number;
    const query = `SELECT * FROM share_db WHERE share_number = ${id}`;

    const shareResult = await new Promise((resolve, reject) => {
        share_db.query(query, (err, result) => {
            if (err) {
                console.log(err);
                reject(err);
            } else {
                resolve(result);
            }
        });
    });

    if (Object.keys(shareResult).length === 0) {
        res.send(false).status(200);
    } else {
        res.send(shareResult).status(200);
    }
});

app.post("/api/share", (req, res) => {
    const data = req.query;
    const query = `INSERT INTO share_db (title, ddate, tesk, share_number) VALUES ("${data.title}", "${data.ddate}", "${data.tesk}", ${data.share_number});`;
    share_db.beginTransaction((err) => {
        if (err)
            console.log("transaction err : " + err);
        else {
            share_db.query(query, (err, result) => {
                if (err) {
                    console.log(err);
                    res.send(false).status(500);
                    return;
                } else {
                    share_db.commit((err) => {
                        if (err) {
                            console.log("commit err : " + err);
                            share_db.rollback(()=> {
                                console.log("rollback");
                                res.send("transaction failed").status(500);
                            })
                        }
                    })
                    res.send(true).status(200);
                    return;
                }
            })
        }
    })
    
})

app.listen(port, () => {
    console.log(`서버 실행 : http://localhost:${port}`);
});